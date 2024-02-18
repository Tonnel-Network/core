import {
  Address,
  beginCell, Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  toNano
} from 'ton-core';


export class NFTItem implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new NFTItem(address);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendTransfer(provider: ContractProvider, via: Sender,
                     opts: {
                       toAddress: Address;
                       value: bigint;
                     }) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0x5fcc3d14, 32) // opcode (reference TODO)
        .storeUint(0, 64) // queryid
        .storeAddress(opts.toAddress)
        .storeAddress(opts.toAddress)
        .storeBit(false)
        .storeCoins(0)
        .storeBit(false)
        .endCell(),
    });
  }

  async sendToHide(provider: ContractProvider, via: Sender,
                     opts: {
                       toAddress: Address;
                       value: bigint;
                       commitment: bigint;
                       id: number;
                       payload: Builder
                     }) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0x5fcc3d14, 32) // opcode (reference TODO)
        .storeUint(0, 64) // queryid
        .storeAddress(opts.toAddress)
        .storeUint(0, 2)
        .storeBit(false)
        .storeCoins(toNano("0.15"))
        .storeBit(false)
        .storeRef(beginCell().storeUint(opts.commitment, 256).storeUint(opts.id, 32).storeBuilder(opts.payload).endCell())


        .endCell(),
    });
  }

  async getContent(provider: ContractProvider) {
    const result = await provider.get('get_nft_data', []);
    result.stack.readBigNumber()
    result.stack.readBigNumber()
    result.stack.readAddress()
    result.stack.readAddress()
    const content = result.stack.readCell()

    console.log(content.beginParse().loadUint(8))
    return;

  }

  async getOwner(provider: ContractProvider) {
    const result = await provider.get('get_nft_data', []);
    result.stack.readBigNumber()
    result.stack.readBigNumber()
    result.stack.readAddress()
    return result.stack.readAddress()

  }

}