import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider, Dictionary, DictionaryValue,
  Sender,
  SendMode, toNano
} from 'ton-core';
import {TupleItemSlice} from "ton-core/dist/tuple/tuple";

export type PrivateIDOConfig = {
  owner: Address;
  perNFTLimit: bigint;
  totalSupply: bigint;
  WHITELIST: { address: Address, amount: number }[]
};

const CellRef: DictionaryValue<Cell> = {
  serialize: (src, builder) => {
    builder.storeSlice(src.beginParse())
  },
  parse: (src) => src.asCell(),
}

export function tonnelConfigToCell(config: PrivateIDOConfig): Cell {
  const empty = Dictionary.empty(Dictionary.Keys.BigUint(256), CellRef)
  config.WHITELIST.forEach((item) => {
    empty.set(
      BigInt("0x" + beginCell().storeAddress(item.address).endCell().hash().toString('hex')),
      beginCell().storeUint(item.amount, 32).storeCoins(0).endCell()
    )
  })

  return beginCell().storeDict(empty).storeAddress(config.owner).storeCoins(config.perNFTLimit).storeCoins(config.totalSupply).storeCoins(0).endCell()
}

export const Opcodes = {
  send_TON: 2696729355,
  withdraw_TON: 3280699740,
  set_limit: 3133655516,
};
// const error::not_staked = 700;
// const error::not_enough = 701;
export const ERRORS = {
  not_staked: 700,
  not_enough: 701

};

export class PrivateIDO implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new PrivateIDO(address);
  }

  static createFromConfig(config: PrivateIDOConfig, code: Cell, workchain = 0) {
    const data = tonnelConfigToCell(config);
    const init = {code, data};
    return new PrivateIDO(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendInvest(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.send_TON, 32).storeUint(0, 64).endCell(),
    });
  }

  async sendwithdrawTON(provider: ContractProvider, via: Sender, value: bigint, amount: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.withdraw_TON, 32).storeUint(0, 64).storeCoins(amount).endCell(),
    });
  }

  async sendSetLimit(provider: ContractProvider, via: Sender, value: bigint, amount: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.set_limit, 32).storeUint(0, 64).storeCoins(amount).endCell(),
    });
  }


  async getBalance(provider: ContractProvider) {
    const result = await provider.getState();
    return result.balance;
  }

  async getState(provider: ContractProvider) {
    const result = await provider.get('get_state', []);
    return result.stack;
  }

}
