import { Asset } from './Asset';
import { Factory } from './Factory';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt64,
  Struct,
  Signature,
} from 'snarkyjs';
import { Delivery, Flex } from './Flex';
import { READINGS, THIRTY_MINUTES, getTime } from './utils';

let proofsEnabled = false;
class BidAction extends Struct({ asset: PublicKey, pricePerKw: UInt64 }) {}
describe('Main tests', () => {
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    adminAccount: PublicKey,
    adminKey: PrivateKey,
    factoryAddress: PublicKey,
    factoryPrivateKey: PrivateKey,
    factory: Factory,
    userPrivKey: PrivateKey,
    userAddr: PublicKey;

  beforeAll(async () => {
    // if (proofsEnabled) await Factory.compile();
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);
    ({ privateKey: adminKey, publicKey: adminAccount } = Local.testAccounts[1]);
    ({ privateKey: userPrivKey, publicKey: userAddr } = Local.testAccounts[2]);
    factoryPrivateKey = PrivateKey.random();
    factoryAddress = factoryPrivateKey.toPublicKey();
    factory = new Factory(factoryAddress);
    // console.log('adminAccount', adminAccount.toBase58());
    // console.log('deployerAccount', deployerAccount.toBase58());
    // console.log('factoryAddress', factoryAddress.toBase58());

    await localDeploy();
  });

  // beforeEach(() => {});

  async function localDeploy() {
    const txn1 = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      factory.deploy();
    });
    await txn1.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn1.sign([deployerKey, factoryPrivateKey]).send();
  }
  function createReadings(
    power: number,
    startTimestamp: number, // Expected in seconds
    device: PrivateKey
  ): [Field[], Field[], Signature] {
    // First list: 30 items with the provided number
    const powers: Field[] = new Array(READINGS).fill(Field(power));

    // Second list: 30 timestamps in increments of minutes from the provided time
    const times: Field[] = Array.from(
      { length: READINGS },
      (_, i) => Field(startTimestamp + i * 60) // Incrementing by 60 seconds
    );

    // Concatenate the first and second lists
    const combinedData = [...powers, ...times];

    // Create a single signature for the combined data
    const signature: Signature = Signature.create(device, combinedData);

    return [powers, times, signature];
  }

  it('correctly updates the admin state on the `Factory` smart contract', async () => {
    // update transaction
    const txn = await Mina.transaction(deployerAccount, () => {
      factory.updateAdmin(adminAccount);
    });
    await txn.prove();
    await txn.sign([deployerKey]).send();

    const updatedAdmin = factory.admin.get();
    expect(updatedAdmin).toEqual(adminAccount);
  });
  // {
  // do in a loop of 6
  let assetPrivKeys: PrivateKey[] = [];
  let assetAddresses: PublicKey[] = [];
  let assetArr: Asset[] = [];
  for (let i = 0; i < 6; i++) {
    assetPrivKeys.push(PrivateKey.random());
    assetAddresses.push(assetPrivKeys[i].toPublicKey());
    assetArr.push(new Asset(assetAddresses[i]));
  }

  it('correctly creates `Asset` smart contracts', async () => {
    //do it assetArr length times
    for (let i = 0; i < assetArr.length; i++) {
      const txn = await Mina.transaction(adminAccount, () => {
        AccountUpdate.fundNewAccount(adminAccount);
        assetArr[i].deploy();
      });
      await txn.prove();
      await txn.sign([adminKey, assetPrivKeys[i]]).send();
    }
  });

  // Do for each asset
  let approvedKey = PrivateKey.random();
  let approvedAddr = approvedKey.toPublicKey();

  it('correctly registres asset on Factory', async () => {
    //do it assetArr length times
    for (let i = 0; i < assetArr.length; i++) {
      const tx1 = await Mina.transaction(adminAccount, () => {
        factory.registerAsset(
          assetAddresses[i],
          userAddr,
          UInt64.from(20),
          approvedAddr
        );
      });
      await tx1.prove();
      await tx1.sign([adminKey]).send();
    }
  });

  //do in loop of 3
  let flexPrivKeys: PrivateKey[] = [];
  let flexAddresses: PublicKey[] = [];
  let flexArr: Flex[] = [];
  for (let i = 0; i < 3; i++) {
    flexPrivKeys.push(PrivateKey.random());
    flexAddresses.push(flexPrivKeys[i].toPublicKey());
    flexArr.push(new Flex(flexAddresses[i]));
  }
  // from 6AM
  let startTimes = [getTime(), getTime(), getTime()];
  let endTimes = [
    // 15.5 hours later, taking submission every 30 minutes
    getTime(31 * THIRTY_MINUTES),
    getTime(31 * THIRTY_MINUTES),
    getTime(31 * THIRTY_MINUTES),
  ];

  let contractedWatts = [17004, 13119, 15283];

  it('correctly deploys a new `Flex` smart contract', async () => {
    // do it flexArr length times
    for (let i = 0; i < flexArr.length; i++) {
      const tx1 = await Mina.transaction(deployerAccount, () => {
        AccountUpdate.fundNewAccount(deployerAccount);
        flexArr[i].deploy();
      });
      await tx1.prove();
      await tx1.sign([deployerKey, flexPrivKeys[i]]).send();
    }
  });

  it('correctly registres flex contract on Factory', async () => {
    // do for flexArr length times and for startTimes, endTimes, contractedWatts
    for (let i = 0; i < flexArr.length; i++) {
      const tx1 = await Mina.transaction(adminAccount, () => {
        factory.createFlexContract(
          flexAddresses[i],
          //flex data here
          UInt64.from(startTimes[i]),
          UInt64.from(endTimes[i]),
          UInt64.from(contractedWatts[i])
        );
      });
      await tx1.prove();
      await tx1.sign([adminKey, flexPrivKeys[i]]).send();
      // console.log(i, ' flex contract created');
    }

    //TODO assert check if token are minted to the flex contract
  });

  // bid on contract
  it('correctly bids on a `Flex` smart contract', async () => {
    const pricePerKw = UInt64.from(10);
    //as asset, submit bid to each flex contract
    for (let i = 0; i < flexArr.length; i++) {
      for (let j = 0; j < assetArr.length; j++) {
        const txn = await Mina.transaction(userAddr, () => {
          assetArr[j].bidOnContract(flexAddresses[i], pricePerKw);
        });
        await txn.prove();
        await txn.sign([userPrivKey]).send();

        // fetches all events
        let events = await flexArr[i].fetchEvents();
        expect(new BidAction({ asset: assetAddresses[j], pricePerKw })).toEqual(
          events[j].event.data
        );
      }
    }
  });

  // Bid again
  // Get all events
  const randomNumber = Math.floor(Math.random() * 6);

  //assert winner for all flex contracts
  it('correctly asserts the winner of a `Flex` smart contract', async () => {
    //as admin, set winner for each flex contract
    for (let i = 0; i < flexArr.length; i++) {
      const tx1 = await Mina.transaction(adminAccount, () => {
        flexArr[i].setWinner(assetAddresses[randomNumber]);
      });
      await tx1.prove();
      await tx1.sign([adminKey]).send();
    }
  });

  it('Test all batches', async () => {
    // Read final state
    for (let i = 0; i < flexArr.length; i++) {
      let powerLeftToDeliver = flexArr[i].powerLeftToDeliver.get();
      // console.log('powerLeftToDeliver flag: ', powerLeftToDeliver.toString());

      const numberSubmissions = (endTimes[i] - startTimes[i]) / (30 * 60);

      for (let s = 0; s < numberSubmissions; s++) {
        powerLeftToDeliver = flexArr[i].powerLeftToDeliver.get();
        console.log(
          'for id',
          i,
          'powerLeftToDeliver flag: ',
          powerLeftToDeliver.toString()
        );

        if (powerLeftToDeliver.toString() === UInt64.from(0).toString()) {
          console.log('break at s:', s, 'flex contract:', i);
          break;
        }

        const [kwh, timestamp, signature] = createReadings(
          150,
          // Math.floor(5000 / READINGS), /// X per batch
          startTimes[i] + 1800 * s,
          approvedKey
        );

        let deliveryData = new Delivery({
          signature,
          kwh,
          timestamp,
        });

        const txn = await Mina.transaction(deployerAccount, () => {
          flexArr[i].deliveryUpdate(deliveryData);
        });

        await txn.prove();
        await txn.sign([deployerKey]).send();

        // const value = await flexArr[i].value.get();
        const counter = flexArr[i].submissionCounter.get();
        console.log('submissionCounter: ', counter.toString());

        // Assert sub counter has increased
        expect(counter.toString()).toEqual((s + 1).toString());
      }

      // Read final state
      powerLeftToDeliver = flexArr[i].powerLeftToDeliver.get();
      console.log('powerLeftToDeliver flag: ', powerLeftToDeliver.toString());
    }
  });
});
