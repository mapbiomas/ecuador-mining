/**
 * @name
 *      P08-integration.js
 *
 * @description
 *      Mining cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 8: integrates the final classifications of all mining region
 *      groups into the national mining map.
 *
 *      1. Mosaics the final image of each region group (REGION_VERSIONS).
 *         Where regions overlap, the region listed LAST is kept.
 *      2. Pixels of Ecuador with no value (outside the mining regions or
 *         masked in them) become 27 (other); pixels outside Ecuador are masked.
 *      3. Exports the national image (one band per year).
 *
 * @usage
 *      1. Update REGION_VERSIONS with the final version of each region group (P07).
 *      2. Set the output version, run, review the years and start the export task.
 *
 * @inputs
 *      <CLASSIFICATION_FT_PATH>/ECUADOR-<regions>-<version>  (one per region group)
 *
 * @outputs
 *      <PARAMS.outputPath>/ECUADOR-MINING-<outputVersion>
 *      bands 'classification_<year>': 30 = mining, 27 = other.
 *
 * @author
 *      Fabricio Garcés - EcoCiencia; MapBiomas Amazonía development team
 *
 * @version
 *      1.0.0 (2026-09-03)
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
  theme: 'MINING',
  collection: '4.0',
  source: 'EcoCiencia',

  outputVersion: 1,
  outputPath: 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION4/CROSS_CUTTING_THEMES/MINING/STEP04-INTEGRATION',

  // Years added to the map.
  yearsPreview: { first: 1985, last: 2025 },

  // *** CAUTION *** true deletes the existing asset with the same name before exporting.
  overwrite: false
};

// Final version of each region group [regions, version]. The regions are
// written as in the asset names ('401-402' = regions 401 and 402 together).
// Order matters where regions overlap: later regions are drawn on top.
var REGION_VERSIONS = [
  ['401-402', 5],
  ['406', 4],
  ['409', 6]
];


// =============================================================================
// 2. MODULES, ASSETS AND CONSTANTS
// =============================================================================

var palette = require('users/mapbiomasecuador/LULC:MODULES/Palettes.js').get('EcuadorCol4');

// Folder of the filtered classifications (output folder of P03-P07).
var CLASSIFICATION_FT_PATH = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION4/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/classification-ft';
var COUNTRY_ASSET = 'projects/mapbiomas-ecuador/assets/AUXILIAR-DATA/VECTOR/COLLECTION-4/nivel_politico_1_col4';

var OTHER = 27;



// =============================================================================
// 3. INTEGRATION
// =============================================================================

var country = ee.FeatureCollection(COUNTRY_ASSET);

var countryMask = country
  .map(function (f) { return f.set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

var assets = REGION_VERSIONS.map(function (item) {
  return CLASSIFICATION_FT_PATH + '/' + PARAMS.country + '-' + item[0] + '-' + item[1];
});

print('Regions integrated', assets);

var integration = ee.ImageCollection(assets)
  .mosaic()
  .unmask(OTHER)
  .updateMask(countryMask)
  .set({
    version: PARAMS.outputVersion,
    collection: PARAMS.collection,
    country: PARAMS.country,
    source: PARAMS.source,
    theme: PARAMS.theme,
    created: ee.Date(Date.now()).format('YYYY-MM-dd HH:mm:ss')
  });

print('Output image', integration);


// =============================================================================
// 4. MAP
// =============================================================================

// Whole image with the year in `bands`: the Inspector shows every year.
for (var year = PARAMS.yearsPreview.first; year <= PARAMS.yearsPreview.last; year++) {
  var vis = { bands: 'classification_' + year, min: 0, max: palette.length - 1, palette: palette };
  Map.addLayer(integration, vis, PARAMS.theme + ' ' + year, false);
}


// =============================================================================
// 5. EXPORT
// =============================================================================

var outputName = PARAMS.country + '-' + PARAMS.theme + '-' + PARAMS.outputVersion;
var assetId = PARAMS.outputPath + '/' + outputName;

if (PARAMS.overwrite) {
  try {
    ee.data.deleteAsset(assetId);
  } catch (error) {
    print('Nothing to delete: ' + assetId);
  }
}

Export.image.toAsset({
  image: integration.byte().reproject('EPSG:4326', null, 30),
  description: outputName,
  assetId: assetId,
  pyramidingPolicy: { '.default': 'mode' },
  region: country.geometry().bounds(),
  scale: 30,
  maxPixels: 1e13
});
