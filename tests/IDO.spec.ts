import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {beginCell, Cell, toNano} from 'ton-core';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {IDO} from "../wrappers/IDO";

describe('IDO', () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile('IDO');
  });

  let blockchain: Blockchain;
  let ido: SandboxContract<IDO>;
  let owner: SandboxContract<TreasuryContract>;


  beforeEach(async () => {
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury('owner');

    const deployer = await blockchain.treasury('deployer');

    ido = blockchain.openContract(
      IDO.createFromConfig(
        {
          owner: owner.address,
          referrals: [
            {address: (await blockchain.treasury('sender1')).address, referralID: 'sender1'},
            {address: (await blockchain.treasury('sender2')).address, referralID: 'sender2'},
            {address: (await blockchain.treasury('sender3')).address, referralID: 'sender3'},
            {address: (await blockchain.treasury('sender4')).address, referralID: 'sender4'},
          ]
        },
        code
      )
    );


    const deployResult = await ido.sendDeploy(deployer.getSender(), toNano('0.05'));

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: ido.address,
      deploy: true,
      success: true,
    });


  });

  it('should deploy and buy tonnel', async () => {
    const balanceOwner = await owner.getBalance();
    let sender1 = await blockchain.treasury('sender1');
    let sender2 = await blockchain.treasury('sender2');
    let sender3 = await blockchain.treasury('sender3');
    let sender4 = await blockchain.treasury('sender4');
    console.log( await ido.getPrice())
    console.log( await ido.getState())

    blockchain.now = Math.floor(new Date().getTime() / 1000)
    let sendTON1 = await ido.sendBuyTONNEL(sender1.getSender(), toNano('1000'), 'sender2');
    // let sendTON2 = await ido.sendBuyTONNEL(sender2.getSender(), toNano('1500'), 'sender2');
    // let sendTON3 = await ido.sendBuyTONNEL(sender3.getSender(), toNano('1000'), 'sender3');
    // let sendTON4 = await ido.sendBuyTONNEL(sender4.getSender(), toNano('1000'), 'sender4');
    console.log( await ido.getPrice())
    console.log( await ido.getState())


    expect(sendTON1.transactions).toHaveTransaction({
      from: sender1.address,
      to: ido.address,
      success: true,
    })
    console.log( await ido.getPrice())


    expect(sendTON1.transactions).toHaveTransaction({
      from: ido.address,
      to: sender2.address,
      success: true,
      value: toNano('10')
    })
    // @ts-ignore
    blockchain.now += (61 * 60);

    let sendTON2 = await ido.sendBuyTONNEL(sender2.getSender(), toNano('1500'), 'sender5');
    expect(sendTON2.transactions).toHaveTransaction({
      from: sender2.address,
      to: ido.address,
      success: true,
    })
    console.log( await ido.getPrice())

    // expect(sendTON1.transactions).toHaveTransaction({
    //   from: sender2.address,
    //   to: privateIDO.address,
    //   success: true,
    // })
    // expect(sendTON2.transactions).toHaveTransaction({
    //   from: sender3.address,
    //   to: privateIDO.address,
    //   success: true,
    // })
    // expect(sendTON3.transactions).toHaveTransaction({
    //   from: sender4.address,
    //   to: privateIDO.address,
    //   success: true,
    // })
    // let balance = await privateIDO.getBalance();
    //
    // console.log(balance)
    //
    // let receiveTON = await privateIDO.sendwithdrawTON(owner.getSender(), toNano('0.04'), toNano('4500'));
    // expect(receiveTON.transactions).toHaveTransaction({
    //   from: privateIDO.address,
    //   to: owner.address,
    //   success: true,
    //   value: toNano('4500')
    // })
    // balance = await privateIDO.getBalance();
    // console.log(balance)
    // expect(balance < toNano(1)).toEqual(true)
    // expect(balanceOwner - (await owner.getBalance()) - toNano(4500) < toNano(1)).toEqual(true);
    //
    // // const setLimitTON = await privateIDO.sendSetLimit(owner.getSender(), toNano('0.02'), toNano('1500'));
    // const state = await privateIDO.getState();
    // console.log(state)
    //
    // const setLimitTON = await privateIDO.sendSetLimit(owner.getSender(), toNano('0.02'), toNano('1500'));
    //
    // const sendTON5 = await privateIDO.sendInvest(sender1.getSender(), toNano('100'));
    // const sendTON6 = await privateIDO.sendInvest(sender2.getSender(), toNano('1000'));
    // const sendTON7 = await privateIDO.sendInvest(sender3.getSender(), toNano('3000'));
    // const sendTON8 = await privateIDO.sendInvest(sender4.getSender(), toNano('700'));
    //
    // const balance1 = await privateIDO.getBalance();
    // console.log(balance1)
    // expect(balance1 - toNano(2100) <toNano('0.1')).toEqual(true)
    //
    // let receiveTON2 = await privateIDO.sendwithdrawTON(owner.getSender(), toNano('0.04'), toNano('2100'));
    // expect(receiveTON2.transactions).toHaveTransaction({
    //   from: privateIDO.address,
    //   to: owner.address,
    //   success: true,
    //   value: toNano('2100')
    // })

  }, 10000);

});