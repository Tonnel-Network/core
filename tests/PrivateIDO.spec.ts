import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {beginCell, Cell, toNano} from 'ton-core';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {PrivateIDO} from "../wrappers/PrivateIDO";

describe('PrivateIDO', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('PrivateIDO');
  });

  let blockchain: Blockchain;
  let privateIDO: SandboxContract<PrivateIDO>;
  let owner: SandboxContract<TreasuryContract>;


  beforeEach(async () => {
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury('owner');
    console.log(owner.address.toString())

    const deployer = await blockchain.treasury('deployer');

    privateIDO = blockchain.openContract(
      PrivateIDO.createFromConfig(
        {
          owner: owner.address,
          perNFTLimit: toNano('1000'),
          totalSupply: toNano('15500'),
          WHITELIST: [
            {address: (await blockchain.treasury('sender1')).address, amount: 1},
            {address: (await blockchain.treasury('sender2')).address, amount: 2},
            {address: (await blockchain.treasury('sender3')).address, amount: 1},
            {address: (await blockchain.treasury('sender4')).address, amount: 1},
          ]
        },
        code
      )
    );


    const deployResult = await privateIDO.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: privateIDO.address,
      deploy: true,
      success: true,
    });


  });

  it('should deploy and send ton', async () => {
    const balanceOwner = await owner.getBalance();
    let sender1 = await blockchain.treasury('sender1');
    let sender2 = await blockchain.treasury('sender2');
    let sender3 = await blockchain.treasury('sender3');
    let sender4 = await blockchain.treasury('sender4');

    let sendTON = await privateIDO.sendInvest(sender1.getSender(), toNano('1100'));
    let sendTON1 = await privateIDO.sendInvest(sender2.getSender(), toNano('1500'));
    let sendTON2 = await privateIDO.sendInvest(sender3.getSender(), toNano('1000'));
    let sendTON3 = await privateIDO.sendInvest(sender4.getSender(), toNano('1000'));




    expect(sendTON.transactions).toHaveTransaction({
      from: sender1.address,
      to: privateIDO.address,
      success: true,
    })
    expect(sendTON1.transactions).toHaveTransaction({
      from: sender2.address,
      to: privateIDO.address,
      success: true,
    })
    expect(sendTON2.transactions).toHaveTransaction({
      from: sender3.address,
      to: privateIDO.address,
      success: true,
    })
    expect(sendTON3.transactions).toHaveTransaction({
      from: sender4.address,
      to: privateIDO.address,
      success: true,
    })
    let balance = await privateIDO.getBalance();

    console.log(balance)

    let receiveTON = await privateIDO.sendwithdrawTON(owner.getSender(), toNano('0.04'), toNano('4500'));
    expect(receiveTON.transactions).toHaveTransaction({
      from: privateIDO.address,
      to: owner.address,
      success: true,
      value: toNano('4500')
    })
    balance = await privateIDO.getBalance();
    console.log(balance)
    expect(balance < toNano(1)).toEqual(true)
    expect(balanceOwner - (await owner.getBalance()) - toNano(4500) < toNano(1)).toEqual(true);

    // const setLimitTON = await privateIDO.sendSetLimit(owner.getSender(), toNano('0.02'), toNano('1500'));
    const state = await privateIDO.getState();
    console.log(state)

    const setLimitTON = await privateIDO.sendSetLimit(owner.getSender(), toNano('0.02'), toNano('1500'));

    const sendTON4 = await privateIDO.sendInvest(sender1.getSender(), toNano('100'));
    const sendTON5 = await privateIDO.sendInvest(sender2.getSender(), toNano('1000'));
    const sendTON6 = await privateIDO.sendInvest(sender3.getSender(), toNano('3000'));
    const sendTON7 = await privateIDO.sendInvest(sender4.getSender(), toNano('700'));

    const balance1 = await privateIDO.getBalance();
    console.log(balance1)
    expect(balance1 - toNano(2100) <toNano('0.1')).toEqual(true)

    let receiveTON2 = await privateIDO.sendwithdrawTON(owner.getSender(), toNano('0.04'), toNano('2100'));
    expect(receiveTON2.transactions).toHaveTransaction({
      from: privateIDO.address,
      to: owner.address,
      success: true,
      value: toNano('2100')
    })

  }, 10000);

});