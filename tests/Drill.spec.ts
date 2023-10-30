import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {beginCell, Cell, toNano} from 'ton-core';
import {JettonMinter} from '../wrappers/JettonMinter';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {JettonWallet} from "../wrappers/JettonWallet";
import {TonnelJetton} from "../wrappers/TonnelJetton";
import {Drill} from "../wrappers/Drill";

describe('Drill', () => {
  let codeDrill: Cell;
  let codeWallet: Cell;
  let codeMaster: Cell;

  beforeAll(async () => {
    codeDrill = await compile('Drill');
    codeWallet = await compile('JettonWallet');
    codeMaster = await compile('JettonMinter');
  });

  let blockchain: Blockchain;
  let drill: SandboxContract<Drill>;
  let rewardMinter: SandboxContract<JettonMinter>;
  let lpMinter: SandboxContract<JettonMinter>;
  let owner: SandboxContract<TreasuryContract>;


  beforeEach(async () => {
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury('owner');

    rewardMinter = blockchain.openContract(JettonMinter.createFromConfig({
      adminAddress: owner.address,
      content: "",
      jettonWalletCode: codeWallet
    }, codeMaster));

    const deployer = await blockchain.treasury('deployer');
    const deployJettonResult = await rewardMinter.sendDeploy(owner.getSender(), toNano('0.05'));
    expect(deployJettonResult.transactions).toHaveTransaction({
      from: owner.address,
      to: rewardMinter.address,
      deploy: true,
      success: true,
    });
    lpMinter = blockchain.openContract(JettonMinter.createFromConfig({
      adminAddress: owner.address,
      content: "a",
      jettonWalletCode: codeWallet
    }, codeMaster));

    await blockchain.treasury('deployer');
    const deployLpResult = await lpMinter.sendDeploy(owner.getSender(), toNano('0.05'));

    drill = blockchain.openContract(
        Drill.createFromConfig(
            {
              ownerAddress: owner.address,
              lpBytecode: codeWallet,
              lpMinterAddress: lpMinter.address,
              rewardMinterAddress: rewardMinter.address,
            },
            codeDrill
        )
    );

    const deployResult = await drill.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: drill.address,
      deploy: true,
      success: true,
    });
    for (let i = 0; i < 10; i++) {
      const sender = await blockchain.treasury('sender'+i);
      const mintResult = await lpMinter.sendMint(owner.getSender(), {
        toAddress: sender.address,
        jettonAmount: toNano('1000'),
        amount: toNano('0.02'),
        queryId: 1,
        value: toNano('0.07')
      });
      expect(mintResult.transactions).toHaveTransaction({
        from: owner.address,
        to: lpMinter.address,
        success: true,
      });

    }



    await rewardMinter.sendMintAccess((await blockchain.treasury('owner')).getSender(), {
      value: toNano('0.02'),
      queryId: 0,
      mintAccess: drill.address
    })
  });

  it('should work', async () => {
    let senders = []
    for (let i = 0; i < 10; i++) {
        senders.push(await blockchain.treasury('sender'+i));
    }
    blockchain.now = Math.floor(new Date().getTime() / 1000)

    const lpWalletSenders = []
    const rewardWalletSenders= []
    for (let i = 0; i < 10; i++) {
        lpWalletSenders.push(await blockchain.openContract(
            JettonWallet.createFromAddress(await lpMinter.getWalletAddress(senders[i].address))))
        rewardWalletSenders.push(await blockchain.openContract(
            JettonWallet.createFromAddress(await rewardMinter.getWalletAddress(senders[i].address))))


    }
    const lpWalletOwner = await blockchain.openContract(
        JettonWallet.createFromAddress(await lpMinter.getWalletAddress(owner.address)))

    const lpWalletDrill = await blockchain.openContract(
        JettonWallet.createFromAddress(await lpMinter.getWalletAddress(drill.address)))

    for (let i = 0; i < 10; i++) {
      const drillResult = await lpWalletSenders[i].sendTransfer(senders[i].getSender(), {
        value: toNano((0.07).toString()),
        toAddress: drill.address,
        queryId: 0,
        fwdAmount: toNano('0.03'),
        jettonAmount: toNano('10'),
        fwdPayload: beginCell().endCell()
      });
      expect(drillResult.transactions).toHaveTransaction({
        from: lpWalletDrill.address,
        to: drill.address,
        success: true,
      });

    }
    blockchain.now += 10000

    for (let i = 0; i < 10; i++) {
      const randomNumber = Math.floor(Math.random() * 0)
      console.log(await drill.getUserState(senders[i].address))
      console.log(await lpWalletDrill.getBalance())

      const withdrawResult = await drill.sendWithdraw(senders[i].getSender(), {
        value: toNano((0.06).toString()),
        amount: toNano(randomNumber.toString()),
        queryID: 0,
      });
      if(randomNumber > 0) {
        expect(withdrawResult.transactions).toHaveTransaction({
          from: lpWalletDrill.address,
          to: lpWalletSenders[i].address,
          success: true,
        });
      }

      expect(withdrawResult.transactions).toHaveTransaction({
        from: rewardMinter.address,
        to: rewardWalletSenders[i].address,
        success: true,
      });

    }

    console.log(await lpWalletDrill.getBalance())
    blockchain.now += 100000000


    const withdrawEmeregencyResult = await drill.sendEmergencyWithdraw(owner.getSender(), {
      value: toNano((0.1).toString()),
      amount: await lpWalletDrill.getBalance(),
      queryID: 0,
    });
      expect(withdrawEmeregencyResult.transactions).toHaveTransaction({
        from: lpWalletDrill.address,
        to: lpWalletOwner.address,
        success: true,
      });

    console.log(await lpWalletDrill.getBalance())





  });


});