/**
- Asset details:
	Fields:
		- Owner’s public key
		- Link to physical attributes (location, power, certification)
	Functions:
		- updateOwner():
		- updateLinkSpecs():

 */
import {
  Field,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  UInt64,
  Provable,
} from 'snarkyjs';
import { Flex } from './Flex';

export class Asset extends SmartContract {
  @state(PublicKey) owner = State<PublicKey>();
  @state(UInt64) powerCapacity = State<UInt64>();
  @state(PublicKey) approvedSigner = State<PublicKey>();

  // @state(Field) hashOfDetails = State<Field>();

  init() {
    super.init();
    this.owner.set(this.sender);
    this.account.zkappUri.set(
      'www.dnoSecureWebsite.com/asset/' + this.address.toBase58()
    );
  }

  // Would pass struct of details but save only hash
  @method setup(
    newOwner: PublicKey,
    powerCapacity: UInt64,
    approvedSigner: PublicKey
  ) {
    const owner = this.owner.get();
    this.owner.assertEquals(owner);

    owner.assertEquals(this.sender);
    this.owner.set(newOwner);
    this.powerCapacity.set(powerCapacity);
    this.approvedSigner.set(approvedSigner);
  }

  //only owner
  @method bidOnContract(flexContractAddress: PublicKey, pricePerKw: UInt64) {
    const owner = this.owner.get();
    this.owner.assertEquals(owner);
    owner.assertEquals(this.sender);

    const flexContract = new Flex(flexContractAddress);
    flexContract.bid(this.address, pricePerKw);
  }
}
