import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {Address, beginCell, Cell, toNano} from 'ton-core';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {JettonMinter} from "../wrappers/JettonMinter";
import {JettonWallet} from "../wrappers/JettonWallet";
import {APSwap} from "../wrappers/APSwap";
import {Miner} from "../wrappers/Miner";
import MerkleTree from "fixed-merkle-tree";
import {mimcHash2} from "../utils/merkleTree";
const Note = require('../utils/note')
const Account = require('../utils/account')


const rates: {
    [key: string]: number
    } = {}
/**
 * Generates proof and args to claim AP (anonymity points) for a note
 * @param {Account} account The account the AP will be added to
 * @param {Note} note The target note
 * @param {String} publicKey ETH public key for the Account encryption
 * @param {Number} fee Fee for the relayer
 * @param {String} relayer Relayer address
 * @param {Number} rate How many AP is generated for the note in block time
 * @param {String[]} accountCommitments An array of account commitments from miner contract
 * @param {String[]} depositDataEvents An array of account commitments from miner contract
 * @param {{instance: String, hash: String, block: Number, index: Number}[]} depositDataEvents An array of deposit objects from tornadoTrees contract. hash = commitment
 * @param {{instance: String, hash: String, block: Number, index: Number}[]} withdrawalDataEvents An array of withdrawal objects from tornadoTrees contract. hash = nullifierHash
 */


describe('Miner', () => {
  let code: Cell;
  let codeWallet: Cell;
  let codeMaster: Cell;
  async function getJettonBalance(address: Address) {
    const jettonWallet = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)))
    return (await jettonWallet.getBalance());
  }
  beforeAll(async () => {
    code = await compile('Miner');
    codeWallet = await compile('JettonWallet');
    codeMaster = await compile('JettonMinter');

  });

  let blockchain: Blockchain;
  let miner: SandboxContract<Miner>;
  let owner: SandboxContract<TreasuryContract>;
  let jettonMaster: SandboxContract<JettonMinter>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury('owner');

    const deployer = await blockchain.treasury('deployer');
    jettonMaster = blockchain.openContract(JettonMinter.createFromConfig({
      adminAddress: owner.address,
      content: "",
      jettonWalletCode: codeWallet
    }, codeMaster));
    const deployJettonResult = await jettonMaster.sendDeploy(owner.getSender(), toNano('0.05'));
    expect(deployJettonResult.transactions).toHaveTransaction({
      from: owner.address,
      to: jettonMaster.address,
      deploy: true,
      success: true,
    });


    miner = blockchain.openContract(
      Miner.createFromConfig(
        {
          JettonMasterAddress: jettonMaster.address,
            ADMIN_ADDRESS: owner.address,
            REWARD_SWAP_ADDRESS: owner.address,
            TONNEL_TREE_ADDRESS: owner.address
        },
        code
      )
    );


    const deployResult = await miner.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: miner.address,
      deploy: true,
      success: true,
    });
    await jettonMaster.sendMintAccess(owner.getSender(),{
      value: toNano('0.02'),
      queryId: 0,
      mintAccess: miner.address
    })

  });

  it('should deploy and check', async () => {
    const note1 = new Note({
      amount: 10,
      depositTime: 5,
      withdrawTime: 10,
      instance: miner.address,
    });
    const note2 = new Note({
      amount: 10,
      depositTime: 5,
      withdrawTime: 20,
      instance: miner.address,
    });
    const note3 = new Note({
      amount: 10,
      depositTime: 5,
      withdrawTime: 30,
      instance: miner.address,
    });
    const note = note1
    const notes = [note1, note2, note3]

    const zeroAccount = new Account()
    const accountCount = await miner.getAccountCount()
    expect(zeroAccount.amount).toBe(0)
    expect(accountCount).toBe(0)
    const rewardNullifierBefore = await miner.getRewardNullifier(note.rewardNullifier)
    expect(rewardNullifierBefore).toBe(false)
    const accountNullifierBefore = await miner.getaccountNullifiers(zeroAccount.nullifier)
    expect(accountNullifierBefore).toBe(false)





    //   let ONE_DAY = 86400;
  //   blockchain.now = start_time + ONE_DAY * 364;
  //   // console.log(await apswap.getTONNELVirtualBalance());
  //   console.log(await miner.getExpectedReturn(BigInt(100 * 86400)));
  //   console.log(await apswap.getExpectedReturn(BigInt(10 * 86400)));
  // for (let i = 0; i < 100; i++) {
  //   const resSwap = await apswap.sendSwap(owner.getSender(),
  //       toNano('0.1'),
  //       BigInt(100 * 86400),
  //       owner.address
  //   );
  //   expect(resSwap.transactions).toHaveTransaction({
  //     from: owner.address,
  //     to: apswap.address,
  //     success: true,
  //   });
  //   console.log(await apswap.getTokenSold());
  // }
  //
  //
  //   console.log(await apswap.getExpectedReturn(BigInt(100 * 86400)));
  //   console.log(await apswap.getExpectedReturn(BigInt(10 * 86400)));
  //
  });



});