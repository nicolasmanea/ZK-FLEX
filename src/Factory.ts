/**
- DNO (factory flexibility and asset) contract:
	Fields:
		- Off-chain link to biddable flexibility contracts
		- Merkle of all flexibility contract addresses (Maybe?)
		- Admin key 
 */
import {
  Field,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  UInt64,
  Struct,
  Provable,
} from 'snarkyjs';

import { Asset } from './Asset';
import { Flex } from './Flex';

export class Factory extends SmartContract {
  @state(PublicKey) admin = State<PublicKey>();

  events = {
    withdrawCredit: Struct({ pub: PublicKey, value: Field }),
  };

  init() {
    super.init();
    this.admin.set(this.sender);
  }

  @method updateAdmin(newAdmin: PublicKey) {
    const admin = this.admin.get();
    this.admin.assertEquals(admin);
    admin.assertEquals(this.sender);

    this.admin.set(newAdmin);
  }

  @method registerAsset(
    newAssetAddress: PublicKey,
    assetOwner: PublicKey,
    powerCapacity: UInt64,
    approvedSigner: PublicKey
  ) {
    //onlyAdmin
    const admin = this.admin.get();
    this.admin.assertEquals(admin);
    // admin.assertEquals(this.sender);

    const asset = new Asset(newAssetAddress);
    asset.setup(assetOwner, powerCapacity, approvedSigner);
  }

  @method createFlexContract(
    newContractAddress: PublicKey,
    startTime: UInt64,
    endTime: UInt64,
    contractedWatts: UInt64
  ) {
    //onlyAdmin
    const admin = this.admin.get();
    this.admin.assertEquals(admin);
    admin.assertEquals(this.sender);

    const flex = new Flex(newContractAddress);
    flex.setup(this.address, startTime, endTime, contractedWatts, admin);
    //todo
    // this.token.mint({
    //   address: newContractAddress,
    //   amount: contractedWatts,
    // });
  }

  //pricePerKw ?
  @method withdrawCredit(amount: UInt64) {
    this.token.burn({
      address: this.sender,
      amount,
    });
    this.emitEvent('withdrawCredit', {
      pub: this.sender,
      value: amount,
    });
  }
}
