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
import {TupleItemSlice} from 'ton-core/dist/tuple/tuple';

export type JettonMinterConfig = {
  adminAddress: Address;
  content: string;
  jettonWalletCode: Cell;
};
const OFFCHAIN_CONTENT_PREFIX = 0x01;

export function buildJettonOffChainMetadata(contentUri: string): Cell {
  return beginCell()
    .storeInt(OFFCHAIN_CONTENT_PREFIX, 8)
    .storeBuffer(Buffer.from(contentUri, "ascii"))
    .endCell();
}

export function jettonMinterConfigToCell(config: JettonMinterConfig): Cell {


  return beginCell()
    .storeCoins(0)
    .storeAddress(config.adminAddress)
    .storeRef(buildJettonOffChainMetadata(config.content))
    .storeRef(config.jettonWalletCode)
    .storeDict(null)
    .endCell();
}

export class JettonMinter implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new JettonMinter(address);
  }

  static createFromConfig(config: JettonMinterConfig, code: Cell, workchain = 0) {
    const data = jettonMinterConfigToCell(config);
    const init = {code, data};
    return new JettonMinter(contractAddress(workchain, init), init);
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
                   jettonAmount: bigint;
                   amount: bigint;
                   queryId: number;
                   value: bigint;
                 }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(21, 32)
        .storeUint(opts.queryId, 64)
        .storeAddress(opts.toAddress)
        .storeCoins(opts.amount)
        .storeRef(
          beginCell()
            .storeUint(0x178d4519, 32)
            .storeUint(opts.queryId, 64)
            .storeCoins(opts.jettonAmount)
            .storeAddress(this.address)
            .storeAddress(this.address)
            .storeCoins(0)
            .storeUint(0, 1)
            .endCell()
        )
        .endCell(),
    });
  }

  async sendMintAccess(provider: ContractProvider, via: Sender,
                       opts: {
                         mintAccess: Address;
                         queryId: number;
                         value: bigint;
                       }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(5, 32)
        .storeUint(opts.queryId, 64)
        .storeAddress(opts.mintAccess)
        .endCell(),
    });
  }

  async sendDeleteMintAccess(provider: ContractProvider, via: Sender,
                             opts: {
                               mintAccess: Address;
                               queryId: number;
                               value: bigint;
                             }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(6, 32)
        .storeUint(opts.queryId, 64)
        .storeAddress(opts.mintAccess)
        .endCell(),
    });
  }

  async getWalletAddress(provider: ContractProvider, address: Address): Promise<Address> {
    const result = await provider.get('get_wallet_address', [
      {
        type: 'slice',
        cell: beginCell().storeAddress(address).endCell()
      } as TupleItemSlice
    ]);

    return result.stack.readAddress();
  }

  async getTotalsupply(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('get_jetton_data', []);
    return result.stack.readBigNumber();
  }

}