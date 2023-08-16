import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  toNano
} from 'ton-core';

export type ZKNFTCollectionConfig = {
  adminAddress: Address;
  nftItemCode: Cell;
  masterJetton: Address;
  jettonWalletCell: Cell;
};
const OFFCHAIN_CONTENT_PREFIX = 0x01;
const Opcodes = {
  mint: 222,
  continue: 0x00,
  transferPrivate: 0x777,
  reveal: 0x888,
};
const serializeUri = (uri: string) => {
  return new TextEncoder().encode(encodeURI(uri));
}

function create_content() {
  const contentBuffer = serializeUri("https://api.tonnel.network/test/zknft/meta");
  const contentBaseBuffer = serializeUri("https://api.tonnel.network/test/zknft/");
  var content_cell = beginCell().storeUint(OFFCHAIN_CONTENT_PREFIX, 8);
  contentBuffer.forEach((byte) => {
    content_cell.storeUint(byte, 8);
  })

  var content_base = beginCell()
  contentBaseBuffer.forEach((byte) => {
    content_base.storeUint(byte, 8);
  })
  return beginCell().storeRef(content_cell.endCell()).storeRef(content_base.endCell())
}

export function ZKNFTCollectionConfigToCell(config: ZKNFTCollectionConfig) {

  return beginCell()
    .storeAddress(config.adminAddress)
    .storeUint(0, 64)// next_item_index
    .storeRef(create_content().endCell())
    .storeRef(config.nftItemCode)
    .storeRef(beginCell().storeUint(5, 16).storeUint(100, 16).storeAddress(config.adminAddress).endCell())
    .storeRef(beginCell()
      .storeUint(0, 8)
      .storeRef(beginCell().storeAddress(config.masterJetton).storeRef(config.jettonWalletCell).endCell())
      .storeRef(beginCell().endCell())
      .storeDict(null)
      .endCell())
    .endCell();
}

export class ZKNFTCollection implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new ZKNFTCollection(address);
  }

  static createFromConfig(config: ZKNFTCollectionConfig, code: Cell, workchain = 0) {
    const data = ZKNFTCollectionConfigToCell(config);
    const init = {code, data};
    return new ZKNFTCollection(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }


  async sendContinue(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryID?: number;
    }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.continue, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .endCell(),
    });
  }


  async sendTransfer(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryID?: number;
      a: Cell;
      b: Cell;
      c: Cell;
      root: bigint;
      nullifier: bigint;
      newCommitment: bigint;
    }
  ) {
    const inputCell = beginCell()
      .storeUint(Opcodes.transferPrivate, 32)
      .storeUint(opts.queryID ?? 0, 64)
      .storeRef(
        beginCell()
          .storeUint(opts.root, 256)
          .storeUint(opts.nullifier, 256)
          .storeUint(opts.newCommitment, 256)
          .storeRef(
            beginCell().storeRef(opts.a).storeRef(opts.b)
              .storeRef(opts.c).endCell()
          )
          .endCell()
      )
      .endCell()
    // const check = await this.getCheckVerify(provider, inputCell);
    // console.log(check)
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: inputCell,
    });
  }

  async sendReveal(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryID?: number;
      a: Cell;
      b: Cell;
      c: Cell;
      nullifier: bigint;
      id: number;
      newOwner: Address;
      root: bigint;
    }
  ) {
    const inputCell = beginCell()
      .storeUint(Opcodes.reveal, 32)
      .storeUint(opts.queryID ?? 0, 64)
      .storeRef(
        beginCell()
          .storeUint(opts.root , 256)
          .storeUint(opts.nullifier, 256)
          .storeAddress(opts.newOwner)
          .storeUint(opts.id, 32)
          .storeRef(
            beginCell().storeRef(opts.a).storeRef(opts.b)
              .storeRef(opts.c).endCell()
          )
          .endCell()
      )
      .endCell()
    // const check = await this.getCheckVerify(provider, inputCell);
    // console.log(check)
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: inputCell,
    });
  }

  async getAddress(provider: ContractProvider, index: bigint) {
    const result = await provider.get('get_nft_address_by_index', [
      {type: 'int', value: index},
    ]);
    // console.log(result.stack.readAddress());
    return result.stack.readAddress();

  }


  async getLastRoot(provider: ContractProvider) {
    const result = await provider.get('get_last_root', []);
    return result.stack.readBigNumberOpt();
  }
  async getRootKnown(provider: ContractProvider, root: bigint) {
    const result = await provider.get('get_root_known', [
      {type: 'int', value: root},
    ]);
    return result.stack.readNumber();
  }

  async getBalance(provider: ContractProvider) {
    const result = await provider.getState();
    return result.balance;
  }
}