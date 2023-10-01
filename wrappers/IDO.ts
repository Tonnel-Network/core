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

export type IDOConfig = {
  owner: Address;
  referrals: { address: Address, referralID: string }[]
};

const CellRef: DictionaryValue<Cell> = {
  serialize: (src, builder) => {
    builder.storeSlice(src.beginParse())
  },
  parse: (src) => src.asCell(),
}

export function IDOConfigToCell(config: IDOConfig): Cell {
  const empty = Dictionary.empty(Dictionary.Keys.BigUint(256), CellRef)
  config.referrals.forEach((item) => {
    empty.set(
      BigInt("0x" + beginCell().storeStringTail(item.referralID).endCell().hash().toString('hex')),
      beginCell().storeAddress(item.address).endCell()
    )
  })
  const unixTime = Math.floor(new Date().getTime() / 1000);

  return beginCell().storeDict(empty).storeAddress(config.owner).storeBit(1).storeCoins(0).storeCoins(toNano('1')).storeCoins(0).storeUint(unixTime,32).endCell()
}

export const Opcodes = {
  buy_TONNEL: 846073365,
  withdraw_TON: 3280699740,
  finish_sale: 1641017685,
  start_sale: 3164944080
};
export const ERRORS = {
  not_staked: 700,
  not_enough: 701

};

export class IDO implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new IDO(address);
  }

  static createFromConfig(config: IDOConfig, code: Cell, workchain = 0) {
    const data = IDOConfigToCell(config);
    const init = {code, data};
    return new IDO(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendBuyTONNEL(provider: ContractProvider, via: Sender, value: bigint, referralID: string) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.buy_TONNEL, 32).storeUint(0, 64).storeUint(BigInt("0x" + beginCell().storeStringTail(referralID).endCell().hash().toString('hex')), 256).endCell(),
    });
  }

  async sendWithdrawTON(provider: ContractProvider, via: Sender, value: bigint, amount: bigint) {
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
      body: beginCell().storeUint(Opcodes.start_sale, 32).storeUint(0, 64).storeCoins(amount).endCell(),
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

  async getPrice(provider: ContractProvider) {
    const result = await provider.get('get_price', []);
    console.log(result.stack)
    return result.stack.readBigNumber();
  }

  async getReferral(provider: ContractProvider, referrerId:string) {
    const result = await provider.get('get_referral', [
      {type: 'int', value: BigInt("0x" + beginCell().storeStringTail(referrerId).endCell().hash().toString('hex'))},
    ]);
    console.log(result.stack)
    return result.stack.readBigNumber();
  }



}
