import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider, Dictionary, DictionaryValue,
  Sender,
  SendMode,
  toNano
} from 'ton-core';
import {getCashBack, getReferral} from "./IDO";

export type ZKNFTCollectionConfig = {
  adminAddress: Address;
  nftItemCode: Cell;
  masterJetton: Address;
  jettonWalletCell: Cell;
  discounts: Address[];
};
const OFFCHAIN_CONTENT_PREFIX = 0x01;
const Opcodes = {
  mint: 222,
  continue: 0x00,
  transferPrivate: 0x777,
  reveal: 0x888,
  stuck_remove: 0x111

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
export const CellRef: DictionaryValue<Cell> = {
  serialize: (src, builder) => {
    builder.storeSlice(src.beginParse())
  },
  parse: (src) => src.asCell(),
}

export function ZKNFTCollectionConfigToCell(config: ZKNFTCollectionConfig) {
  const discounts = Dictionary.empty(Dictionary.Keys.BigUint(256), CellRef)
  for (let i = 0; i < config.discounts.length; i++) {
    discounts.set(
        BigInt("0x" + beginCell().storeAddress(config.discounts[i]).endCell().hash().toString('hex')),
        beginCell().storeUint(1, 2).endCell()
    )
  }
  const roots = Dictionary.empty(Dictionary.Keys.BigUint(8), CellRef)
  roots.set(BigInt(0), beginCell().storeUint(43859932230369129483580312926473830336086498799745261185663267638134570341235n, 256).endCell())
  return beginCell()
    .storeAddress(config.adminAddress)
    .storeUint(1, 64)// next_item_index
    .storeRef(create_content().endCell())
    .storeRef(config.nftItemCode)
    .storeRef(beginCell().storeUint(5, 16).storeUint(100, 16).storeAddress(config.adminAddress).endCell())
    .storeRef(beginCell()
      .storeRef(beginCell().storeAddress(config.masterJetton).storeRef(config.jettonWalletCell).endCell())
      .storeRef(beginCell().storeUint(0,8).storeUint(0,32).storeDict(roots).endCell())
      .storeDict(null)
        .storeRef(beginCell().storeUint(0,8).storeCoins(toNano('2')).storeDict(discounts).storeDict(null).endCell())
      .endCell())
    .endCell();
}

export class ZKNFTCollection implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new ZKNFTCollection(address);
  }

  static createFromConfig(config: {
    nftItemCode: Cell;
    discounts: Address[];
    jettonWalletCell: Cell;
    adminAddress: Address;
    masterJetton: Address
  }, code: Cell, workchain = 0) {
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


  async sendMintOwner(provider: ContractProvider, via: Sender, opts: {
    value: bigint;
    fwd_amount: bigint;
    payload: Cell;
  }){
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(4, 32).storeUint(0, 64)
          .storeCoins(opts.fwd_amount)
          .storeRef(opts.payload)
          .endCell(),
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
      newRoot: bigint;
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
                beginCell()
                    .storeUint(opts.newRoot, 256)
                    .endCell()
            )
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

  async sendRemoveMinStuck(
      provider: ContractProvider,
      via: Sender,
      opts: {
        value: bigint;
        queryID?: number;
        commitment: bigint;
        newRoot: bigint;
        oldRoot: bigint;
        payload: Cell;
      }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
          .storeUint(Opcodes.stuck_remove, 32)
          .storeUint(opts.queryID ?? 0, 64)
          .storeRef(beginCell().storeUint(opts.commitment, 256).storeUint(
              opts.newRoot, 256
          ).storeUint(
              opts.oldRoot, 256
          ).storeRef(opts.payload).endCell())
          .endCell(),
    });
  }

  async getAddress(provider: ContractProvider, index: bigint) {
    const result = await provider.get('get_nft_address_by_index', [
      {type: 'int', value: index},
    ]);
    // console.log(result.stack.readAddress());
    return result.stack.readAddress();

  }
  async getMinStuck(provider: ContractProvider) {
    const result = await provider.get('get_min_stuck', []);
    console.log(result.stack)
    return result.stack.readNumber();
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