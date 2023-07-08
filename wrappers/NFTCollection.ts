import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from 'ton-core';
import { TupleItemSlice } from 'ton-core/dist/tuple/tuple';

export type NFTCollectionConfig = {
  adminAddress: Address;
  nftItemCode: Cell;
};
const OFFCHAIN_CONTENT_PREFIX = 0x01;

const serializeUri = (uri: string) => {
  return new TextEncoder().encode(encodeURI(uri));
}

function create_content() {
  const contentBuffer = serializeUri("https://api.tonnel.network/metadata");
  const contentBaseBuffer = serializeUri("https://api.tonnel.network/nft/");
  var content_cell =  beginCell().storeUint(OFFCHAIN_CONTENT_PREFIX, 8);
  contentBuffer.forEach((byte) => {
    content_cell.storeUint(byte, 8);
  })

  var content_base =  beginCell()
  contentBaseBuffer.forEach((byte) => {
    content_base.storeUint(byte, 8);
  })
  return  beginCell().storeRef(content_cell.endCell()).storeRef(content_base.endCell())
}
export function NFTCollectionConfigToCell(config: NFTCollectionConfig) {

  return beginCell()
    .storeAddress(config.adminAddress)
    .storeUint(0, 64)// next_item_index
    .storeRef(create_content().endCell())
    .storeRef(config.nftItemCode)
    .storeRef(beginCell().storeUint(5, 16).storeUint(100, 16).storeAddress(config.adminAddress).endCell())
    .storeRef(beginCell().storeCoins(0).storeUint(10,32).endCell())
    .endCell();
}

export class NFTCollection implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

  static createFromAddress(address: Address) {
    return new NFTCollection(address);
  }

  static createFromConfig(config: NFTCollectionConfig, code: Cell, workchain = 0) {
    const data = NFTCollectionConfigToCell(config);
    const init = { code, data };
    return new NFTCollection(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendMint(provider: ContractProvider, via: Sender,
                 opts: {
                   toAddress: Address;
                   value: bigint;
                 }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(222, 32) // opcode (reference TODO)
        .storeUint(0, 64) // queryid
        .storeCoins(toNano('0.05')) // gas fee
        .storeRef(
          beginCell().storeAddress(opts.toAddress).endCell()
        )
        .endCell(),
    });
  }

  async sendChangePrice(provider: ContractProvider, via: Sender,
                 opts: {
                   value: bigint;
                 }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(4, 32) // opcode (reference TODO)
        .storeUint(0, 64) // queryid
        .storeCoins(toNano('1')) // price NFT
        .storeUint(5, 32) // how many
        .endCell(),
    });
  }

  async getAddress(provider: ContractProvider, index: bigint) {
    const result = await provider.get('get_nft_address_by_index', [
      { type: 'int', value: index },
    ]);
    // console.log(result.stack.readAddress());
    return result.stack.readAddress();

  }


}