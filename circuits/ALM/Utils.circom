include "./merkleTree.circom";

// computes commitment = pedersen(secret, nullifier)

template CommitmentHasher() {
    signal input secret;
    signal input nullifier;
    signal output nullifierHash;
    signal output commitment;
    component hasher = HashLeftRight();
    hasher.left <== secret;
    hasher.right <== nullifier;

    component hasherNullifier = HashLeftRight();
    hasherNullifier.left <== nullifier;
    hasherNullifier.right <== nullifier;



    commitment <== hasher.hash;
    nullifierHash <== hasherNullifier.hash;

}
