/**
 * @name
 *      P01-classification.js
 *
 * @description
 *      Mining cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 1: Random Forest classification of mining (30) vs. other (27),
 *      year by year, inside the mining areas of interest (ROI).
 *
 *      For each year:
 *        1. Builds the median mosaic of the year (all satellites) for the
 *           classification regions and keeps the bands of FEATURE_SPACE,
 *           only inside the ROI.
 *        2. Samples the mosaic at the training points (property 'id':
 *           30 = mining, 27 = other).
 *        3. Trains a Random Forest and classifies the mosaic.
 *        4. Optionally forces class 27 inside exclusion polygons.
 *        5. Exports the classification and the samples.
 *
 *      The training points are drawn for a specific year: check that they
 *      are valid for every year being classified.
 *
 * @usage
 *      1. Draw or import in the Code Editor the ROI, the training points and
 *         (optional) the exclusion polygons, and list them in PARAMS.
 *      2. Set the regions, years and versions, run, review the layers and
 *         start the export tasks.
 *
 * @inputs
 *      - Annual mosaics (LULC step 1): MOSAICS
 *      - ROI, training points and exclusion polygons drawn in the Code Editor
 *
 * @outputs
 *      Per year:
 *      - Image  <paths.pathMinigClasificationPre><COUNTRY>-<regions>-<year>-<outputVersion>
 *        band 'classification_<year>': 30 = mining, 27 = other; masked outside the ROI.
 *      - Table  <paths.pathMinigSamplesAct>/samples-mining-<regions>-<year>-<samplesOutputVersion>
 *
 * @author
 *      MapBiomas Ecuador team (EcoCiencia)
 *
 * @version
 *      1.0.0 (2026)
 *
 * @theme
 *      Mining
 *
 * @collection
 *      4
 */


// =============================================================================
// 1. PARAMETERS
// =============================================================================

var PARAMS = {
  country: 'ECUADOR',

  // Classification regions (field 'id_region'), processed together.
  regionIds: [401, 402],

  years: [2025],

  // Random Forest
  trees: 100,
  variablesPerSplit: 1,

  // FeatureCollections drawn or imported in the Code Editor.
  // Mining areas of interest: the classification is done only inside them.
  // Example: [Areas_mineria_2024]
  roi: [],
  // Training points with the property 'id' (30 = mining, 27 = other).
  // Example: miningPoints: [id_30_2024], otherPoints: [id_27_2024]
  miningPoints: [],
  otherPoints: [],
  // Polygons forced to class 27: property 'id' = 27. Example: [exclude]. [] = none.
  exclusion: [],

  // Planet NICFI monthly basemaps, only for visual reference (requires
  // access to the NICFI program).
  planet: {
    activate: false,
    year: 2024,
    months: [2, 3, 4, 5, 11]
  },

  samplesOutputVersion: 999,
  outputVersion: 998
};


// =============================================================================
// 2. MODULES, ASSETS AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;
var palette = require('users/mapbiomasecuador/LULC:MODULES/Palettes.js').get('EcuadorCol4');

var MOSAICS = ['projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2', 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2'];
var PLANET_NICFI = 'projects/planet-nicfi/assets/basemaps/americas';

var OTHER = 27;

// Mosaic bands used by the classifier.
var FEATURE_SPACE = [
  'ndvi_median',
  'ndfi_median',
  'evi2_median',
  'soil_median',
  'savi_median',
  'npv_median',
  'soil_amp',
  'nuaci_median',
  'ndfib_median',
  'gvs_median',
  'gcvi_median',
  'pri_median',
  'ndwi_gao_median',
  'ndwi_mcfeeters_median'
];

var CLASS_VIS = { min: 0, max: palette.length - 1, palette: palette };
var MOSAIC_VIS = { bands: ['swir1_median', 'nir_median', 'red_median'], gain: [0.085, 0.05, 0.25] };
var PLANET_VIS = { bands: ['R', 'G', 'B'], min: 0, max: 2000, gamma: 2.25 };


// =============================================================================
// 3. FUNCTIONS
// =============================================================================

/**
 * Merges a list of FeatureCollections (or Features) into one collection.
 */
function mergeAll(list) {
  return list.reduce(function (merged, item) {
    return merged.merge(ee.FeatureCollection(item));
  }, ee.FeatureCollection([]));
}

/**
 * Adds one Planet NICFI basemap per month, clipped to the regions.
 */
function addPlanetLayers(planet, region) {
  var nicfi = ee.ImageCollection(PLANET_NICFI).filterBounds(region);

  planet.months.forEach(function (month) {
    var start = ee.Date.fromYMD(planet.year, month, 1);
    var basemap = nicfi.filter(ee.Filter.date(start, start.advance(1, 'month'))).first();
    Map.addLayer(ee.Image(basemap).clip(region), PLANET_VIS, 'Planet ' + planet.year + '-' + month, false);
  });
}


// =============================================================================
// 4. INPUTS
// =============================================================================

var regionsName = PARAMS.regionIds.join('-');

var region = ee.FeatureCollection(paths.pathMinigRegionAct)
  .filter(ee.Filter.inList('id_region', PARAMS.regionIds));

var roi = mergeAll(PARAMS.roi);

var mosaics = ee.ImageCollection(MOSAICS[0])
  .merge(ee.ImageCollection(MOSAICS[1]))
  .filterBounds(region);

var points = mergeAll(PARAMS.miningPoints.concat(PARAMS.otherPoints));

// 27 inside the exclusion polygons, masked elsewhere.
var exclusionMask = null;
if (PARAMS.exclusion.length > 0) {
  var exclusionAreas = mergeAll(PARAMS.exclusion);
  exclusionMask = exclusionAreas
    .reduceToImage(['id'], ee.Reducer.first())
    .clipToBoundsAndScale({ geometry: exclusionAreas.geometry(), scale: 30 });
}

if (PARAMS.planet.activate) {
  addPlanetLayers(PARAMS.planet, region);
}

Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Regions ' + regionsName, false);


// =============================================================================
// 5. CLASSIFICATION
// =============================================================================

PARAMS.years.forEach(function (year) {

  var yearMosaic = mosaics
    .filter(ee.Filter.eq('year', year))
    .median()
    .clip(region);

  var featureSpace = yearMosaic.select(FEATURE_SPACE).clip(roi);

  var samples = featureSpace.sampleRegions({
    collection: points,
    properties: ['id'],
    scale: 30,
    projection: 'EPSG:4326',
    geometries: true
  });

  var classifier = ee.Classifier.smileRandomForest({
    numberOfTrees: PARAMS.trees,
    variablesPerSplit: PARAMS.variablesPerSplit
  }).train(samples, 'id', FEATURE_SPACE);

  var classification = featureSpace.classify(classifier);

  if (exclusionMask) {
    classification = classification.where(exclusionMask.eq(OTHER), OTHER);
  }

  classification = classification
    .rename('classification_' + year)
    .set({
      regions: regionsName,
      country: PARAMS.country,
      version: PARAMS.outputVersion,
      trees: PARAMS.trees,
      samples_version: PARAMS.samplesOutputVersion,
      description: 'preliminar classification'
    });

  // Samples with the year and the class in 'reference'.
  var samplesOut = samples.map(function (feature) {
    return feature.set('year', String(year)).set('reference', feature.get('id'));
  });

  print('Samples ' + year, samplesOut);
  print('Output image ' + year, classification);

  // Map
  Map.addLayer(yearMosaic, MOSAIC_VIS, 'Mosaic ' + year);
  Map.addLayer(classification, CLASS_VIS, 'Classification ' + year);

  // Exports
  var samplesName = 'samples-mining-' + regionsName + '-' + year + '-' + PARAMS.samplesOutputVersion;

  Export.table.toAsset({
    collection: samplesOut,
    description: samplesName,
    assetId: paths.pathMinigSamplesAct + '/' + samplesName   // path without a trailing '/'
  });

  var outputName = PARAMS.country + '-' + regionsName + '-' + year + '-' + PARAMS.outputVersion;

  Export.image.toAsset({
    image: classification.byte().reproject('EPSG:4326', null, 30),
    description: outputName,
    assetId: paths.pathMinigClasificationPre + outputName,   // path ends with '/'
    scale: 30,
    maxPixels: 1e13,
    region: region.geometry().bounds(),
    pyramidingPolicy: { '.default': 'mode' }
  });
});
