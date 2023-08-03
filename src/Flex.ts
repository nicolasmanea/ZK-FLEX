/**
 - Flexibility contract (escrows money): On chain reference for settlement
	Fields:
		- dateTime 	!	
		- power		! kW
  ----------------------------
		- dispatch time	
		- flexibility service
		- prices		
		- DNO Key
		- Flexibility contract agreed flag
		- Delivered flag
 */

import {
  Field,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  UInt64,
  Reducer,
  Struct,
  Provable,
  Bool,
  Signature,
} from 'snarkyjs';
import { Factory } from './Factory';
import { Asset } from './Asset';
import { READINGS, MINUTE, THIRTY_MINUTES, TWENTY_SECONDS } from './utils';

export class Delivery extends Struct({
  signature: Signature,
  kwh: Provable.Array(Field, READINGS),
  timestamp: Provable.Array(Field, READINGS),
}) {}
// class BidAction extends Struct({ address: PublicKey, pricePerKw: UInt64 }) {}
export class Flex extends SmartContract {
  // @state(PublicKey) factoryContract = State<PublicKey>();
  //MIn capacity ?
  @state(UInt64) startTime = State<UInt64>();
  @state(UInt64) endTime = State<UInt64>();
  @state(UInt64) powerLeftToDeliver = State<UInt64>();
  @state(PublicKey) winner = State<PublicKey>();
  @state(PublicKey) admin = State<PublicKey>();
  @state(Field) submissionCounter = State<Field>();

  // helper field to store the point in the action history that our on-chain state is at
  // @state(Field) actionState = State<Field>();
  // reducer = Reducer({ actionType: BidAction });

  events = {
    bidMade: Struct({ asset: PublicKey, pricePerKw: UInt64 }),
    winningAsset: PublicKey,
  };

  init() {
    super.init();

    this.account.zkappUri.set(
      'www.dnoSecureWebsite.com/contract/' + this.address.toBase58()
    );
    this.winner.set(this.address);
    //test above
    // this.actionState.set(Reducer.initialActionState);
  }

  @method setup(
    factoryContract: PublicKey, //TODO needed ?
    startTime: UInt64,
    endTime: UInt64,
    contractedWatts: UInt64,
    admin: PublicKey
  ) {
    this.admin.set(admin);
    // this.factoryContract.set(factoryContract);
    this.startTime.set(startTime);
    this.endTime.set(endTime);
    this.powerLeftToDeliver.set(contractedWatts);
  }

  @method bid(assetAddress: PublicKey, pricePerKw: UInt64) {
    const winner = this.winner.get();
    this.winner.assertEquals(winner);
    //make sure winner is not set
    winner.assertEquals(this.address);
    //make sure it's called by asset contract
    const asset = new Asset(assetAddress);
    // asset.owner.assertEquals(this.sender);
    let assetCapacity = asset.powerCapacity.get();
    //  // verify min requiremnts !
    // assetCapacity.assertGreaterThanOrEqual;

    // reducer
    // this.reducer.dispatch({ address: this.sender, pricePerKw });
    this.emitEvent('bidMade', { asset: assetAddress, pricePerKw });
  }
  @method setWinner(winner: PublicKey) {
    //only admin
    const admin = this.admin.get();
    this.admin.assertEquals(admin);
    admin.assertEquals(this.sender);

    this.winner.set(winner);
    this.emitEvent('winningAsset', winner);
  }

  @method deliveryUpdate(delivery: Delivery) {
    const winningAsset = this.winner.get();
    this.winner.assertEquals(winningAsset);
    // Get permitted device
    const asset = new Asset(winningAsset);
    const approvedSigner = asset.approvedSigner.get();
    asset.approvedSigner.assertEquals(approvedSigner);

    // Get start, end times and index
    let startTime = this.startTime.get();
    this.startTime.assertEquals(startTime);
    let endTime = this.endTime.get();
    this.endTime.assertEquals(endTime);
    let submissionCounter = this.submissionCounter.get();
    this.submissionCounter.assertEquals(submissionCounter);

    // Get power left to deliver
    let powerLeftToDeliver = this.powerLeftToDeliver.get();
    this.powerLeftToDeliver.assertEquals(powerLeftToDeliver);

    // Block offset
    let blockOffset = UInt64.from(
      UInt64.from(startTime).add(
        UInt64.from(THIRTY_MINUTES).mul(UInt64.from(submissionCounter))
      )
    );

    let minuteOffset = blockOffset;

    // Start limits
    let limitHigh = UInt64.from(minuteOffset).add(UInt64.from(TWENTY_SECONDS));
    let limitLow = UInt64.from(minuteOffset).sub(UInt64.from(TWENTY_SECONDS));

    let remainder: UInt64;
    //30 min in a submission window
    for (let i = 0; i < 30; i++) {
      // Assert within the permitted range
      UInt64.from(delivery.timestamp[i]).assertLessThanOrEqual(limitHigh);
      UInt64.from(delivery.timestamp[i]).assertGreaterThanOrEqual(limitLow);

      // Add minute since last minute offset
      minuteOffset = minuteOffset.add(UInt64.from(MINUTE));

      // Increment offset and limits
      limitHigh = minuteOffset.add(UInt64.from(TWENTY_SECONDS));
      limitLow = minuteOffset.sub(UInt64.from(TWENTY_SECONDS));

      // Delivered amount exceeds minimal requirements
      UInt64.from(delivery.kwh[i]).assertGreaterThanOrEqual(UInt64.from(2));

      // Ensure it doesn't go below zero
      remainder = Provable.if(
        powerLeftToDeliver.lessThanOrEqual(UInt64.from(delivery.kwh[i])),
        powerLeftToDeliver,
        UInt64.from(delivery.kwh[i])
      );

      // Subtract
      powerLeftToDeliver = powerLeftToDeliver.sub(remainder);
    }

    // Check signature over the whole thing
    delivery.signature
      .verify(approvedSigner, [...delivery.kwh, ...delivery.timestamp])
      .assertTrue();

    // this.submissionCounter.assertEquals(submissionCounter);
    this.submissionCounter.set(submissionCounter.add(Field(1)));

    // Set new power level
    this.powerLeftToDeliver.set(powerLeftToDeliver);

    // 'choose cheapest bid'
    // @method closeContract() {
    //   //rollup reducer
    //   //assert winner dominance
    //   let actionState = this.actionState.get();
    //   this.actionState.assertEquals(actionState);
    //   let winner = this.winner.get();
    //   this.winner.assertEquals(winner);
    //   let winningAddr: PublicKey;
    //   // compute the new counter and hash from pending actions
    //   let pendingActions = this.reducer.getActions({
    //     fromActionState: actionState,
    //   });

    //   let { state: newWinner, actionState: newActionState } = this.reducer.reduce(
    //     pendingActions,
    //     // state type
    //     BidAction,
    //     // function that says how to apply an action
    //     (state: BidAction, action: BidAction) => {
    //       return Provable.if(
    //         action.pricePerKw.greaterThan(state.pricePerKw),
    //         BidAction,
    //         action,
    //         state
    //       );
    //     },
    //     { state: winningAddr, actionState }
    //   );

    //   // update on-chain state
    //   this.winner.set(newWinner.address);
    //   this.actionState.set(newActionState);
    // }
  }
}
