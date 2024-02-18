const {toBigIntLE, rbuffer} = require("./circuit");
const {mimcHash2, mimcHash3} = require("./merkleTree");
const {get32BitsOfInstance} = require("../tests/TonnelTree.spec");
const {beginCell} = require("ton-core");

function randomBN(number) {
  return toBigIntLE(rbuffer(number));
}

class Note {
  constructor({ secret, nullifier, amount, depositTime, withdrawTime, instance } = {}) {
    this.secret = secret ? BigInt(secret) : randomBN(31)
    this.nullifier = nullifier ? BigInt(nullifier) : randomBN(31)

    this.commitment = mimcHash2(this.secret.toString(), this.nullifier.toString());
    this.nullifierHash = mimcHash2(this.nullifier.toString(), this.nullifier.toString());
    this.rewardNullifier = mimcHash3(this.nullifier.toString(), this.nullifier.toString(), this.nullifier.toString());

    this.amount = amount
    this.depositBlock = BigInt(depositTime)
    this.withdrawBlock = BigInt(withdrawTime)
    this.instance = Note.getInstance(instance)
  }

  static getInstance(instance) {
    const addressSlice = beginCell().storeAddress(instance).endCell()
    // console.log(addressSlice.beginParse().loadUint(32))
    return addressSlice.beginParse().loadUint(32)
  }

  static fromString(note, instance, depositBlock, withdrawalBlock) {
  //   const [, currency, amount, netId, noteHex] = note.split('-')
  //   const noteBuff = Buffer.from(noteHex.slice(2), 'hex')
  //   const nullifier = new BN(noteBuff.slice(0, 31), 16, 'le')
  //   const secret = new BN(noteBuff.slice(31), 16, 'le')
  //   return new Note({
  //     secret,
  //     nullifier,
  //     netId,
  //     amount,
  //     currency,
  //     depositBlock,
  //     withdrawalBlock,
  //     instance,
  //   })
  }
}

module.exports = Note
