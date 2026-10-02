/**
 * ml/modelIO.js
 * Shared save/load helpers for tf.LayersModel using plain files on disk
 * (model.json + weights.bin). Avoids depending on @tensorflow/tfjs-node's
 * native file:// IOHandler, which requires native compilation.
 */
const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs');

/** Saves a tf.LayersModel to <dir>/model.json + <dir>/weights.bin */
async function saveModelToDisk(model, dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  await model.save(
    tf.io.withSaveHandler(async (artifacts) => {
      const modelJson = {
        modelTopology: artifacts.modelTopology,
        format: artifacts.format,
        generatedBy: artifacts.generatedBy,
        convertedBy: artifacts.convertedBy,
        weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }]
      };

      fs.writeFileSync(path.join(dir, 'model.json'), JSON.stringify(modelJson));
      fs.writeFileSync(path.join(dir, 'weights.bin'), Buffer.from(artifacts.weightData));

      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    })
  );
}

/** Loads a tf.LayersModel previously saved with saveModelToDisk */
async function loadModelFromDisk(dir) {
  const modelJsonPath = path.join(dir, 'model.json');
  const weightsPath = path.join(dir, 'weights.bin');

  const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
  const weightSpecs = modelJson.weightsManifest[0].weights;
  const weightDataBuffer = fs.readFileSync(weightsPath);

  const weightData = weightDataBuffer.buffer.slice(
    weightDataBuffer.byteOffset,
    weightDataBuffer.byteOffset + weightDataBuffer.byteLength
  );

  const artifacts = {
    modelTopology: modelJson.modelTopology,
    format: modelJson.format,
    generatedBy: modelJson.generatedBy,
    convertedBy: modelJson.convertedBy,
    weightSpecs,
    weightData
  };

  return tf.loadLayersModel(tf.io.fromMemory(artifacts));
}

function modelExists(dir) {
  return fs.existsSync(path.join(dir, 'model.json'));
}

module.exports = { saveModelToDisk, loadModelFromDisk, modelExists };
