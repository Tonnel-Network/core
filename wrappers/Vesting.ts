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

export type VestingConfig = {
  WHITELIST: { address: Address, amount: bigint }[]
  JettonMasterAddress: Address;
};

const CellRef: DictionaryValue<Cell> = {
  serialize: (src, builder) => {
    builder.storeSlice(src.beginParse())
  },
  parse: (src) => src.asCell(),
}

export function tonnelConfigToCell(config: VestingConfig): Cell {
  const empty = Dictionary.empty(Dictionary.Keys.BigUint(256), CellRef)
  config.WHITELIST.forEach((item) => {
    empty.set(
      BigInt("0x" + beginCell().storeAddress(item.address).endCell().hash().toString('hex')),
      beginCell().storeCoins(item.amount).storeCoins(0).endCell()
    )
  })

  return beginCell().storeDict(empty).storeAddress(config.JettonMasterAddress).endCell()
}

export const Opcodes = {
  claim_TONNEL: 0xF2081CA6,
};
// const error::not_staked = 700;
// const error::not_enough = 701;
export const ERRORS = {
  cliff_not_passed: 103,
  fully_claimed: 102,
  whitelist: 101

};

export class Vesting implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new Vesting(address);
  }

  static createFromConfig(config: VestingConfig, code: Cell, workchain = 0) {
    const data = tonnelConfigToCell(config);
    const init = {code, data};
    return new Vesting(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendClaimTONNEL(provider: ContractProvider, via: Sender, value: bigint, howMuch: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.claim_TONNEL, 32).storeUint(0, 64).storeCoins(howMuch).endCell(),
    });
  }

  async getBalance(provider: ContractProvider) {
    const result = await provider.getState();
    return result.balance;
  }

  async getState(provider: ContractProvider, sender: Address) {
    const result = await provider.get('get_state', [
      {
        type: 'slice',
        cell: beginCell().storeAddress(sender).endCell()
      } as TupleItemSlice
    ]);
    return result.stack.readBigNumber();
  }

}
