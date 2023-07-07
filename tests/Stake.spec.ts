import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {beginCell, Cell, toNano} from 'ton-core';
import {JettonMinter} from '../wrappers/JettonMinter';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {JettonWallet} from "../wrappers/JettonWallet";
import {TonnelJetton} from "../wrappers/TonnelJetton";
import {Stake} from "../wrappers/Stake";

describe('Stake', () => {
  let code: Cell;
  let codeWallet: Cell;
  let codeMaster: Cell;

  beforeAll(async () => {
    code = await compile('Stake');
    codeWallet = await compile('JettonWallet');
    codeMaster = await compile('JettonMinter');
  });

  let blockchain: Blockchain;
  let stake: SandboxContract<Stake>;
  let jettonMinter: SandboxContract<JettonMinter>;
  let owner: SandboxContract<TreasuryContract>;


  beforeEach(async () => {
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury('owner');

    jettonMinter = blockchain.openContract(JettonMinter.createFromConfig({
      adminAddress: owner.address,
      content: beginCell().endCell(),
      jettonWalletCode: codeWallet
    }, codeMaster));

    const deployer = await blockchain.treasury('deployer');
    const deployJettonResult = await jettonMinter.sendDeploy(owner.getSender(), toNano('0.05'));
    expect(deployJettonResult.transactions).toHaveTransaction({
      from: owner.address,
      to: jettonMinter.address,
      deploy: true,
      success: true,
    });

    stake = blockchain.openContract(
      Stake.createFromConfig(
        {
          jettonMinterAddress: jettonMinter.address,
          jettonWalletBytecode: codeWallet,
        },
        code
      )
    );

    const deployResult = await stake.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: stake.address,
      deploy: true,
      success: true,
    });

    const sender = await blockchain.treasury('sender');
    const mintResult = await jettonMinter.sendMint(owner.getSender(), {
      toAddress: sender.address,
      jettonAmount: toNano('100'),
      amount: toNano('0.02'),
      queryId: 1,
      value: toNano('0.07')
    });


    expect(mintResult.transactions).toHaveTransaction({
      from: owner.address,
      to: jettonMinter.address,
      success: true,
    });
  });

  it('should deploy and stake TON', async () => {
    const owner = await blockchain.treasury('owner');
    const depositAmount = 1;
    const stakeTonResult = await stake.sendStakeTON(owner.getSender(), {
      queryID: 1,
      value: toNano((depositAmount + 0.02).toString()),
    });
    expect(stakeTonResult.transactions).toHaveTransaction({
      from: owner.address,
      to: stake.address,
      success: true,
    });
    expect(await stake.getBalance()).toBeGreaterThanOrEqual(toNano(depositAmount));

    const withdrawTonResult = await stake.sendWithdrawTON(owner.getSender(), {
      queryID: 1,
      value: toNano("0.02"),
      amount: toNano((depositAmount).toString()),
    });
    expect(withdrawTonResult.transactions).toHaveTransaction({
      from: owner.address,
      to: stake.address,
      success: true,
    });
    expect(withdrawTonResult.transactions).toHaveTransaction({
      from: stake.address,
      to: owner.address,
      success: true,
      value: toNano((depositAmount).toString()),
    });

    const withdrawTonResult2 = await stake.sendWithdrawTON(owner.getSender(), {
      queryID: 1,
      value: toNano("0.02"),
      amount: toNano((depositAmount).toString()),
    });
    expect(withdrawTonResult2.transactions).toHaveTransaction({
      from: owner.address,
      to: stake.address,
      success: false
    });
  }, 10000);

  it('should deploy and stake TONNEL', async () => {
    const sender = await blockchain.treasury('sender');



    const jettonWalletStaker= await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))

    const jettonWalletStakeContract = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(stake.address)))

    const stakeResult = await jettonWalletStaker.sendTransfer(sender.getSender(), {
      value: toNano(( 0.07).toString()),
      toAddress: stake.address,
      queryId: 0,
      fwdAmount: toNano('0.02'),
      jettonAmount: toNano('10'),
      fwdPayload: beginCell().endCell()
    });

    expect(stakeResult.transactions).toHaveTransaction({
      from: jettonWalletStaker.address,
      to: jettonWalletStakeContract.address,
      success: true,
    });
    expect(stakeResult.transactions).toHaveTransaction({
      from: jettonWalletStakeContract.address,
      to: stake.address,
      success: true,
    });

    expect(await jettonWalletStakeContract.getBalance()).toEqual(toNano(10));

    const withdrawTonnelResult = await stake.sendWithdrawTONNEL(sender.getSender(), {
      queryID: 0,
      value: toNano("0.02"),
      amount: toNano((10).toString()),
    });
    expect(withdrawTonnelResult.transactions).toHaveTransaction({
      from: sender.address,
      to: stake.address,
      success: true,
    });
    expect(await jettonWalletStakeContract.getBalance()).toEqual(toNano(0));
    expect(await jettonWalletStaker.getBalance()).toEqual(toNano(100));
    const withdrawTonnelResult2 = await stake.sendWithdrawTONNEL(sender.getSender(), {
      queryID: 0,
      value: toNano("0.02"),
      amount: toNano((10).toString()),
    });
    expect(withdrawTonnelResult2.transactions).toHaveTransaction({
      from: sender.address,
      to: stake.address,
      success: false,
    });

  }, 10000);

  it('should deploy and stake TON & TONNEL and withdraw', async () => {

    const sender = await blockchain.treasury('sender');



    const depositAmount = 1;
    const stakeTonResult = await stake.sendStakeTON(owner.getSender(), {
      queryID: 1,
      value: toNano((depositAmount + 0.02).toString()),
    });
    expect(stakeTonResult.transactions).toHaveTransaction({
      from: owner.address,
      to: stake.address,
      success: true,
    });
    expect(await stake.getBalance()).toBeGreaterThanOrEqual(toNano(depositAmount));


    const jettonWalletStaker= await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(sender.address)))

    const jettonWalletStakeContract = await blockchain.openContract(
      JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(stake.address)))

    const stakeResult = await jettonWalletStaker.sendTransfer(sender.getSender(), {
      value: toNano(( 0.07).toString()),
      toAddress: stake.address,
      queryId: 0,
      fwdAmount: toNano('0.02'),
      jettonAmount: toNano('10'),
      fwdPayload: beginCell().endCell()
    });

    expect(stakeResult.transactions).toHaveTransaction({
      from: jettonWalletStaker.address,
      to: jettonWalletStakeContract.address,
      success: true,
    });
    expect(stakeResult.transactions).toHaveTransaction({
      from: jettonWalletStakeContract.address,
      to: stake.address,
      success: true,
    });

    expect(await jettonWalletStakeContract.getBalance()).toEqual(toNano(10));


    const withdrawTonnelResult = await stake.sendWithdrawTONNEL(sender.getSender(), {
      queryID: 0,
      value: toNano("0.02"),
      amount: toNano((5).toString()),
    });
    expect(withdrawTonnelResult.transactions).toHaveTransaction({
      from: sender.address,
      to: stake.address,
      success: true,
    });
    expect(await jettonWalletStakeContract.getBalance()).toEqual(toNano(5));
    expect(await jettonWalletStaker.getBalance()).toEqual(toNano(95));
    const withdrawTonnelResult2 = await stake.sendWithdrawTONNEL(sender.getSender(), {
      queryID: 0,
      value: toNano("0.02"),
      amount: toNano((5).toString()),
    });
    expect(withdrawTonnelResult2.transactions).toHaveTransaction({
      from: sender.address,
      to: stake.address,
      success: true,
    });


    const withdrawTonResult = await stake.sendWithdrawTON(owner.getSender(), {
      queryID: 1,
      value: toNano("0.02"),
      amount: toNano((depositAmount).toString()),
    });
    expect(withdrawTonResult.transactions).toHaveTransaction({
      from: owner.address,
      to: stake.address,
      success: true,
    });
    expect(withdrawTonResult.transactions).toHaveTransaction({
      from: stake.address,
      to: owner.address,
      success: true,
      value: toNano((depositAmount).toString()),
    });
  });
});