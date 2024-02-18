include "../node_modules/circomlib/circuits/comparators.circom";
include "./Utils.circom";

template Reward(levels, zeroLeaf) {
  signal input rate;
  signal input fee;
  signal input instance;
  signal input rewardNullifier;
  signal private input noteSecret;
  signal private input noteNullifier;

  signal private input inputAmount;
  signal private input inputSecret;
  signal private input inputNullifier;
  signal         input inputRoot;
  signal private input inputPathElements[levels];
  signal private input inputPathIndices[levels];
  signal         input inputNullifierHash;

  signal private input outputAmount;
  signal private input outputSecret;
  signal private input outputNullifier;
  signal         input outputRoot;
  signal         input outputPathIndices;
  signal private input outputPathElements[levels];
  signal         input outputCommitment;

  signal private input depositBlock;
  signal         input depositRoot;
  signal private input depositPathIndices[levels];
  signal private input depositPathElements[levels];

  signal private input withdrawalBlock;
  signal         input withdrawalRoot;
  signal private input withdrawalPathIndices[levels];
  signal private input withdrawalPathElements[levels];

  // Check amount invariant
  inputAmount + rate * (withdrawalBlock - depositBlock) === outputAmount + fee;

  // === check input and output accounts and block range ===
  // Check that amounts fit into 248 bits to prevent overflow
  // Fee range is checked by the smart contract
  // Technically block range check could be skipped because it can't be large enough
  // negative number that `outputAmount` fits into 248 bits
  component inputAmountCheck = Num2Bits(248);
  component outputAmountCheck = Num2Bits(248);
  component blockRangeCheck = Num2Bits(32);
  inputAmountCheck.in <== inputAmount;
  outputAmountCheck.in <== outputAmount;
  blockRangeCheck.in <== withdrawalBlock - depositBlock;

  // Compute input commitment
  component inputHasher = HashThree();
  inputHasher.inputs[0] <== inputAmount;
  inputHasher.inputs[1] <== inputSecret;
  inputHasher.inputs[2] <== inputNullifier;

  // Verify that input commitment exists in the tree
  component inputTree = MerkleTreeCheck(levels);
  inputTree.leaf <== inputHasher.out;
  for (var i = 0; i < levels; i++) {
    inputTree.pathElements[i] <== inputPathElements[i];
    inputTree.pathIndices[i] <== inputPathIndices[i];
  }

  // Check merkle proof only if amount is non-zero
  component checkRoot = ForceEqualIfEnabled();
  checkRoot.in[0] <== inputRoot;
  checkRoot.in[1] <== inputTree.root;
  checkRoot.enabled <== inputAmount;

  // Verify input nullifier hash
  component inputNullifierHasher = HashLeftRight();
  inputNullifierHasher.left <== inputNullifier;
  inputNullifierHasher.right <== inputNullifier;
  inputNullifierHasher.hash === inputNullifierHash;

  // Compute and verify output commitment
  component outputHasher = HashThree();

  outputHasher.inputs[0] <== outputAmount;
  outputHasher.inputs[1] <== outputSecret;
  outputHasher.inputs[2] <== outputNullifier;
  outputHasher.out === outputCommitment;

  // Update accounts tree with output account commitment
  component accountTreeUpdater = MerkleTreeUpdater(levels, zeroLeaf);
  accountTreeUpdater.oldRoot <== inputRoot;
  accountTreeUpdater.newRoot <== outputRoot;
  accountTreeUpdater.leaf <== outputCommitment;
  accountTreeUpdater.pathIndices <== outputPathIndices;
  for (var i = 0; i < levels; i++) {
      accountTreeUpdater.pathElements[i] <== outputPathElements[i];
  }

  // === check deposit and withdrawal ===
  // Compute tornado.cash commitment and nullifier
  component noteHasher = CommitmentHasher();
  noteHasher.nullifier <== noteNullifier;
  noteHasher.secret <== noteSecret;

  // Compute deposit commitment
  component depositHasher = HashThree();
  depositHasher.inputs[0] <== instance;
  depositHasher.inputs[1] <== noteHasher.commitment;
  depositHasher.inputs[2] <== depositBlock;

  // Verify that deposit commitment exists in the tree
  component depositTree = MerkleTreeCheck(levels);
  depositTree.leaf <== depositHasher.out;
  for (var i = 0; i < levels; i++) {
    depositTree.pathElements[i] <== depositPathElements[i];
    depositTree.pathIndices[i] <== depositPathIndices[i];
  }
  depositTree.root === depositRoot;

  // Compute withdrawal commitment
  component withdrawalHasher = HashThree();
  withdrawalHasher.inputs[0] <== instance;
  withdrawalHasher.inputs[1] <== noteHasher.nullifierHash;
  withdrawalHasher.inputs[2] <== withdrawalBlock;

  // Verify that withdrawal commitment exists in the tree
  component withdrawalTree = MerkleTreeCheck(levels);
  withdrawalTree.leaf <== withdrawalHasher.out;
  for (var i = 0; i < levels; i++) {
   withdrawalTree.pathElements[i] <== withdrawalPathElements[i];
    withdrawalTree.pathIndices[i] <== withdrawalPathIndices[i];
  }
 withdrawalTree.root === withdrawalRoot;

  // Compute reward nullifier
    component rewardNullifierHasher = HashThree();
    rewardNullifierHasher.inputs[0] <== noteNullifier;
    rewardNullifierHasher.inputs[1] <== noteNullifier;
    rewardNullifierHasher.inputs[2] <== noteNullifier;
   rewardNullifierHasher.out === rewardNullifier;
}

// zeroLeaf = keccak256("tornado") % FIELD_SIZE
component main = Reward(20, 21663839004416932945382355908790599225266501822907911457504978515578255421292);

