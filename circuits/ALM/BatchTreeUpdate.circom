include "./TreeUpdateArgsHasher.circom";
include "./merkleTree.circom";

// Computes hashes of the next tree layer
template TreeLayer(height) {
  var nItems = 1 << height;
  signal input ins[nItems * 2];
  signal output outs[nItems];

  component hash[nItems];
  for(var i = 0; i < nItems; i++) {
    hash[i] = HashLeftRight();
    hash[i].left <== ins[i * 2];
    hash[i].right <== ins[i * 2 + 1];
    hash[i].hash ==> outs[i];
  }
}

// Inserts a leaf batch into a tree
// Checks that tree previously contained zero leaves in the same position
// Hashes leaves with Poseidon hash
// `batchLevels` should be less than `levels`
template BatchTreeUpdate(levels, batchLevels, zeroBatchLeaf) {
  var height = levels - batchLevels;
  var nLeaves = 1 << batchLevels;
  signal input argsHash;
  signal private input oldRoot;
  signal private input newRoot;
  signal private input pathIndices;
  signal private input pathElements[height];
  signal private input hashes[nLeaves];
  signal private input instances[nLeaves];
  signal private input blocks[nLeaves];

  // Check that hash of arguments is correct
  // We compress arguments into a single hash to considerably reduce gas usage on chain
  component argsHasher = TreeUpdateArgsHasher(nLeaves);
  argsHasher.oldRoot <== oldRoot;
  argsHasher.newRoot <== newRoot;
  argsHasher.pathIndices <== pathIndices;
  for(var i = 0; i < nLeaves; i++) {
    argsHasher.hashes[i] <== hashes[i];
    argsHasher.instances[i] <== instances[i];
    argsHasher.blocks[i] <== blocks[i];
  }
  argsHash === argsHasher.out;

  // Compute hashes of all leaves
  component leaves[nLeaves];
  for(var i = 0; i < nLeaves; i++) {
    leaves[i] = HashThree();
    leaves[i].inputs[0] <== instances[i];
    leaves[i].inputs[1] <== hashes[i];
    leaves[i].inputs[2] <== blocks[i];
  }

  // Compute batch subtree merkle root
  component layers[batchLevels];
  for(var level = batchLevels - 1; level >= 0; level--) {
    layers[level] = TreeLayer(level);
    for(var i = 0; i < (1 << (level + 1)); i++) {
      layers[level].ins[i] <== level == batchLevels - 1 ? leaves[i].out : layers[level + 1].outs[i];
    }
  }

  // Verify that batch subtree was inserted correctly
  component treeUpdater = MerkleTreeUpdater(height, zeroBatchLeaf);
  treeUpdater.oldRoot <== oldRoot;
  treeUpdater.newRoot <== newRoot;
  treeUpdater.leaf <== layers[0].outs[0];
  treeUpdater.pathIndices <== pathIndices;
  for(var i = 0; i < height; i++) {
    treeUpdater.pathElements[i] <== pathElements[i];
  }
}


component main = BatchTreeUpdate(20, 5, 18506397520252640569173256109205328697030515085438968144745349329215369264802)
