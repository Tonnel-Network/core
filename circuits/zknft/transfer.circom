
include "../merkleTree.circom";

template TransferNFT(levels) {
    signal private input id;
    signal input root; //3
    signal private input secret;
    signal private input pathElements[levels];
    signal private input pathIndices[levels];

    signal output nullifier;// 1
    signal output newCommitment; //2

    signal input lastRoot;//4
    signal input newRoot;//5
    signal input pathIndicesTreeUpdate;//6
    signal private input pathElementsTreeUpdate[levels];

    component treeUpdate = MerkleTreeUpdater(levels, 21663839004416932945382355908790599225266501822907911457504978515578255421292);
    treeUpdate.oldRoot <== lastRoot;
    treeUpdate.newRoot <== newRoot;
    treeUpdate.leaf <== newCommitment;
    treeUpdate.pathIndices <== pathIndicesTreeUpdate;
    for (var i = 0; i < levels; i++) {
        treeUpdate.pathElements[i] <== pathElementsTreeUpdate[i];
    }

    component commitmentHasher = HashLeftRight();
    commitmentHasher.left <== id;
    commitmentHasher.right <== secret;


    component tree = MerkleTreeCheck(levels);
    tree.leaf <== commitmentHasher.hash;
        tree.root <== root;

        for (var i = 0; i < levels; i++) {
           tree.pathElements[i] <== pathElements[i];
           tree.pathIndices[i] <== pathIndices[i];
       }

    signal newCommitmentSquare;
    newCommitmentSquare <== newCommitment * newCommitment;

    component nullifierHasher = HashLeftRight();
    nullifierHasher.left <== secret;
    nullifierHasher.right <== id;
    nullifier <== nullifierHasher.hash;
}


component main = TransferNFT(20);