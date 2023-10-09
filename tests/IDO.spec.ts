import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {Address, beginCell, Cell, toNano} from 'ton-core';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {IDO} from "../wrappers/IDO";
import {JettonWallet} from "../wrappers/JettonWallet";
import {JettonMinter} from "../wrappers/JettonMinter";

describe('IDO', () => {
  let code: Cell;
  let codeWallet: Cell;
  let codeMaster: Cell;
  async function getJettonBalance(address: Address) {
    const jettonWallet = await blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)))
    return (await jettonWallet.getBalance());
  }
  beforeAll(async () => {
    code = await compile('IDO');
    codeWallet = await compile('JettonWallet');
    codeMaster = await compile('JettonMinter');

  });

  let blockchain: Blockchain;
  let ido: SandboxContract<IDO>;
  let owner: SandboxContract<TreasuryContract>;
  let jettonMaster: SandboxContract<JettonMinter>;


  beforeEach(async () => {
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury('owner');
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

    const deployer = await blockchain.treasury('deployer');

    ido = blockchain.openContract(
      IDO.createFromConfig(
        {
          owner: owner.address,
          referrals: [
            {address: (await blockchain.treasury('sender1')).address, referralID: 'sender1', batch:"gold"},
            {address: (await blockchain.treasury('sender2')).address, referralID: 'sender2', batch:"silver"},
            {address: (await blockchain.treasury('sender3')).address, referralID: 'sender3', batch:"bronze"},
            {address: (await blockchain.treasury('sender4')).address, referralID: 'sender4', batch:"inactiveBronze"},
          ],
            TONNEL_MASTER: jettonMaster.address,

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
    await jettonMaster.sendMintAccess(owner.getSender(),{
        value: toNano('0.02'),
        queryId: 0,
        mintAccess: ido.address,
    })


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
    let sendTON1 = await ido.sendBuyTONNEL(sender1.getSender(), toNano('1000'), 'sender4');
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
      to: sender4.address,
      success: true,
      value: toNano('20')
    })

    expect(sendTON1.transactions).toHaveTransaction({
      from: ido.address,
      to: sender1.address,
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

    let sendTON3 = await ido.sendBuyTONNEL(sender1.getSender(), toNano('3000'), 'sender2');
    console.log( await ido.getPrice())
    expect(sendTON3.transactions).toHaveTransaction({
      from: sender1.address,
      to: ido.address,
      success: true,
    })
    console.log('getter tonnel', await ido.getTONNELPurchased(sender1.address))
    let finishSaleTX = await ido.sendFinishSale(owner.getSender(), toNano('0.05'));

    expect(finishSaleTX.transactions).toHaveTransaction({
      from: owner.address,
      to: ido.address,
      success: true,
    })
    let sendClaimTX = await ido.sendClaimTONNEL(sender1.getSender(), toNano('0.05'));
    expect(sendClaimTX.transactions).toHaveTransaction({
      from: sender1.address,
      to: ido.address,
      success: true,
    })

    console.log('TONNEL Balance', await getJettonBalance(sender1.address))
    console.log('IDO balance', await ido.getBalance())
    let claimTONTX = await ido.sendWithdrawTON(owner.getSender(), toNano('0.05'), toNano('5000'));
    expect(claimTONTX.transactions).toHaveTransaction({
      from: ido.address,
      to: owner.address,
      success: true,
      value: toNano('5000')
    })

  }, 10000);

});