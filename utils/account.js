const {toBigIntLE, rbuffer} = require("./circuit");
const {mimcHash2, mimcHash3} = require("./merkleTree");
function randomBN(number) {
  return toBigIntLE(rbuffer(number));
}

class Account {
  constructor({ amount, secret, nullifier } = {}) {
    this.amount = amount ? BigInt(amount) : BigInt('0')
    this.secret = secret ? BigInt(secret) : randomBN(31)
    this.nullifier = nullifier ? BigInt(nullifier) : randomBN(31)

    this.commitment = mimcHash3(this.amount, this.secret, this.nullifier)
    this.nullifierHash = mimcHash2(this.nullifier, this.nullifier)

    if (this.amount < BigInt(0)) {
      throw new Error('Cannot create an account with negative amount')
    }
  }

}

module.exports = Account
