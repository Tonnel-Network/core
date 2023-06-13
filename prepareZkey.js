const splitFile = require('split-file');
const zlib = require('zlib');
const unzip = zlib.createUnzip();
const fs = require('fs');

const splitFiles = [
  __dirname + '/build/circuits/circuit_final.zkey.gz.sf-part1',
  __dirname + '/build/circuits/circuit_final.zkey.gz.sf-part2',
  __dirname + '/build/circuits/circuit_final.zkey.gz.sf-part3',
  __dirname + '/build/circuits/circuit_final.zkey.gz.sf-part4',
  __dirname + '/build/circuits/circuit_final.zkey.gz.sf-part5',
  __dirname + '/build/circuits/circuit_final.zkey.gz.sf-part6',
  __dirname + '/build/circuits/circuit_final.zkey.gz.sf-part7',
]
splitFile.mergeFiles(splitFiles, __dirname + '/build/circuits/circuit_final.zkey.compressed.gz')
  .then(async () => {
    const inp= fs.createReadStream(__dirname + '/build/circuits/circuit_final.zkey.compressed.gz');
    const out= fs.createWriteStream(__dirname + '/build/circuits/circuit_final.zkey');
    inp.pipe(unzip).pipe(out);
    // wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    fs.unlinkSync(__dirname + '/build/circuits/circuit_final.zkey.compressed.gz');
    // delete splitFiles
    splitFiles.forEach((file) => {
      fs.unlinkSync(file);
    })
  })
  .catch((err) => {
    console.log('Error: ', err);
  });