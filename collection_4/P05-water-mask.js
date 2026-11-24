/**
 * @name
 *      P05-water-mask.js
 *
 * @description
 *      Mining cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 5: water mask, applied to the output of the temporal filter (P04).
 *
 *      Mining pits and dredging areas often contain water, and water can be
 *      confused with mining. In the selected years, pixels classified as
 *      mining (30) that are water (33) in the general land-cover map become
 *      other (27). Inside the optional polygons (`keepAreas`) mining is kept.
 *
 *          mining  water map   ->  output
 *            30       33       ->    27
 *            30     other      ->    30
 *            27       33       ->    27
 *
 *      The general map may not have the newest years yet: WATER_YEARS says
 *      which water year is used for each of them.
 *
 * @usage
 *      1. Set PARAMS: regions, years, versions and (optional) polygons.
 *      2. Run and compare "Original <year>" and "Water mask <year>" with the
 *         "Water <year>" layer, then start the export task.
 *
 * @inputs
 *      - <paths.pathMinigClasificationFilterAct><COUNTRY>-<regions>-<inputVersion>  (P04)
 *      - General land-cover map (water = class 33): WATER_PATH / WATER_ASSETS
 *
 * @outputs
 *      <paths.pathMinigClasificationFilterAct><COUNTRY>-<regions>-<outputVersion>
 *      bands 'classification_<year>': 30 = mining, 27 = other.
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

  // Years where the water mask is applied. Other years are copied unchanged.
  years: [2024, 2025],

  inputVersion: 995,                // P04 temporal filter (outputVersion of P04)
  outputVersion: 994,               // same folder as the input: use a different version

  // FeatureCollection drawn in the Code Editor, with a numeric property
  // 'id' = 1: inside it mining is kept even over water. null = none.
  // Example: keepAreas: geometry
  keepAreas: null,

  // *** CAUTION *** true deletes the existing asset with the same name before exporting.
  overwrite: false
};


// =============================================================================
// 2. MODULES, ASSETS AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;
var palette = require('users/mapbiomasecuador/LULC:MODULES/Palettes.js').get('EcuadorCol4');

// General land-cover map used for water (Collection 3, filtered classification
// of each general-map region).
var WATER_PATH = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/GENERAL_MAP/CLASSIFICATION/classification-ft/';
var WATER_ASSETS = [
  'ECUADOR-40101-12',
  'ECUADOR-40102-11',
  'ECUADOR-40103-11',
  'ECUADOR-40104-10',
  'ECUADOR-40105-13',
  'ECUADOR-40201-12',
  'ECUADOR-40202-14',
  'ECUADOR-40203-11',
  'ECUADOR-40204-12',
  'ECUADOR-40205-10'
];

// Water year used for years that the general map does not have yet.
// Any year not listed uses the same year.
var WATER_YEARS = {
  2024: 2023,
  2025: 2023
};

var MINING = 30;
var OTHER = 27;
var WATER = 33;

var MOSAIC_VIS = { bands: ['swir1_median', 'nir_median', 'red_median'], gain: [0.085, 0.05, 0.25] };
var WATER_VIS = { palette: ['0000ff'] };


// =============================================================================
// 3. INPUTS
// =============================================================================

var regionsName = PARAMS.regionIds.join('-');

var region = ee.FeatureCollection(paths.pathMinigRegionAct)
  .filter(ee.Filter.inList('id_region', PARAMS.regionIds));

var mosaics = ee.ImageCollection(paths.mosaicRaisgAct)
  .merge(ee.ImageCollection(paths.mosaicPacificoAct))
  .filter(ee.Filter.eq('country', PARAMS.country))
  .filterBounds(region);

var inputName = PARAMS.country + '-' + regionsName + '-' + PARAMS.inputVersion;
var mining = ee.Image(paths.pathMinigClasificationFilterAct + inputName);

var water = ee.ImageCollection(WATER_ASSETS.map(function (name) {
  return ee.Image(WATER_PATH + name);
})).mosaic();

function waterOf(year) {
  var waterYear = WATER_YEARS[year] || year;
  return water.select('classification_' + waterYear);
}

// 1 inside the keep areas, 0 elsewhere in the regions.
var keepMask = null;
if (PARAMS.keepAreas) {
  var polygonsImage = PARAMS.keepAreas
    .reduceToImage(['id'], ee.Reducer.first())
    .clipToBoundsAndScale({ geometry: PARAMS.keepAreas.geometry(), scale: 30 });

  keepMask = ee.Image(0).clip(region).where(polygonsImage.eq(1), 1);
}

print('Input: ' + inputName, mining);


// =============================================================================
// 4. WATER MASK
// =============================================================================

var masked = ee.Image.cat(PARAMS.years.map(function (year) {
  var classification = mining.select('classification_' + year);
  var condition = classification.eq(MINING).and(waterOf(year).eq(WATER));

  if (keepMask) {
    condition = condition.and(keepMask.eq(0));
  }

  return classification.where(condition, OTHER);
}));

var output = mining.addBands(masked, null, true).set({
  regions: regionsName,
  country: PARAMS.country,
  version: PARAMS.outputVersion,
  step: 'water mask'
});

print('Output image', output);


// =============================================================================
// 5. MAP
// =============================================================================

if (keepMask) {
  Map.addLayer(keepMask.selfMask(), { palette: ['ffff00'] }, 'Keep areas', false);
}

PARAMS.years.forEach(function (year) {
  // Whole image with the year in `bands`: the Inspector shows every year.
  var vis = { bands: 'classification_' + year, min: 0, max: palette.length - 1, palette: palette };
  var yearWater = waterOf(year);

  Map.addLayer(mosaics.filter(ee.Filter.eq('year', year)).mosaic().clip(region), MOSAIC_VIS, 'Mosaic ' + year);
  Map.addLayer(mining, vis, 'Original ' + year);
  Map.addLayer(output, vis, 'Water mask ' + year);
  Map.addLayer(yearWater.updateMask(yearWater.eq(WATER)), WATER_VIS, 'Water ' + year, false);
});


// =============================================================================
// 6. EXPORT
// =============================================================================

var fileName = PARAMS.country + '-' + regionsName + '-' + PARAMS.outputVersion;
var assetId = paths.pathMinigClasificationFilterAct + fileName;   // path ends with '/'

if (PARAMS.overwrite) {
  try {
    ee.data.deleteAsset(assetId);
  } catch (error) {
    print('Nothing to delete: ' + assetId);
  }
}

Export.image.toAsset({
  image: output.byte(),
  description: fileName,
  assetId: assetId,
  pyramidingPolicy: { '.default': 'mode' },
  region: region.geometry().bounds(),
  crs: 'EPSG:4326',
  scale: 30,
  maxPixels: 1e13
});
