/**
 * @name
 *      P02-stack-multiband.js
 *
 * @description
 *      Mining cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 2: stacks the annual mining classifications (P01) into a single
 *      multiband image, one band per year ('classification_<year>').
 *
 *      The stack can combine two sources:
 *        - years taken from the previous collection (one multiband image),
 *        - new years classified with P01 (one image per year).
 *      If a year is in both, the new classification replaces the previous one.
 *
 * @usage
 *      1. Set PARAMS: regions, years from each source and versions.
 *      2. Run, review the preview years and start the export task.
 *
 * @inputs
 *      - New years: <CURRENT_COLLECTION_PATH><COUNTRY>-<regions>-<year>-<currentCollectionVersion>
 *      - Previous collection (optional): <PARAMS.previousCollectionPath><COUNTRY>-<regions>-<previousCollectionVersion>
 *
 * @outputs
 *      <paths.pathMinigClasificationAct><COUNTRY>-<regions>-<outputVersion>
 *      bands 'classification_<year>': 30 = mining, 27 = other.
 *
 * @author
 *      Fabricio Garcés - EcoCiencia
 *
 * @version
 *      1.0.0 (2026-03-20)
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

  // New years, classified with P01.
  newYears: [2024, 2025],
  currentCollectionVersion: 998,    // P01 (outputVersion of P01)

  // Years taken from the previous collection. [] = none.
  previousCollectionYears: [
    1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992,
    1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000,
    2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008,
    2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016,
    2017, 2018, 2019, 2020, 2021, 2022, 2023
  ],
  previousCollectionVersion: 2,
  previousCollectionPath: 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/clasificacion/',   // must end with '/'

  yearsPreview: [2023, 2024, 2025],

  outputVersion: 997,

  // *** CAUTION *** true deletes the existing asset with the same name before exporting.
  overwrite: false
};


// =============================================================================
// 2. MODULES, ASSETS AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;
var palette = require('users/mapbiomasecuador/LULC:MODULES/Palettes.js').get('EcuadorCol4');

// Folder of the P01 classifications.
var CURRENT_COLLECTION_PATH = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION4/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/preliminar/';

function bandNames(years) {
  return years.map(function (year) { return 'classification_' + year; });
}


// =============================================================================
// 3. STACK
// =============================================================================

var regionsName = PARAMS.regionIds.join('-');

var region = ee.FeatureCollection(paths.pathMinigRegionAct)
  .filter(ee.Filter.inList('id_region', PARAMS.regionIds));

var regionMask = region
  .map(function (f) { return f.set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

// New years: one image per year, band 'classification_<year>'.
var newYearsImage = ee.Image.cat(PARAMS.newYears.map(function (year) {
  return ee.Image(CURRENT_COLLECTION_PATH + PARAMS.country + '-' + regionsName + '-' +
    year + '-' + PARAMS.currentCollectionVersion).updateMask(regionMask);
})).byte();

var stack = newYearsImage;

// Previous years; new years replace them if repeated.
if (PARAMS.previousCollectionYears.length > 0) {
  stack = ee.Image(PARAMS.previousCollectionPath + PARAMS.country + '-' + regionsName + '-' +
    PARAMS.previousCollectionVersion)
    .select(bandNames(PARAMS.previousCollectionYears))
    .updateMask(regionMask)
    .byte()
    .addBands(newYearsImage, null, true);
}

stack = stack.set({
  regions: regionsName,
  country: PARAMS.country,
  version: PARAMS.outputVersion,
  step: 'stack multiband'
});

print('Stack', stack);


// =============================================================================
// 4. MAP
// =============================================================================

Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Regions ' + regionsName, false);

PARAMS.yearsPreview.forEach(function (year) {
  // Whole image with the year in `bands`: the Inspector shows every year.
  var vis = { bands: 'classification_' + year, min: 0, max: palette.length - 1, palette: palette };
  Map.addLayer(stack, vis, 'Stack ' + year);
});


// =============================================================================
// 5. EXPORT
// =============================================================================

var fileName = PARAMS.country + '-' + regionsName + '-' + PARAMS.outputVersion;
var assetId = paths.pathMinigClasificationAct + fileName;   // path ends with '/'

if (PARAMS.overwrite) {
  try {
    ee.data.deleteAsset(assetId);
  } catch (error) {
    print('Nothing to delete: ' + assetId);
  }
}

Export.image.toAsset({
  image: stack.byte().reproject('EPSG:4326', null, 30),
  description: fileName,
  assetId: assetId,
  scale: 30,
  pyramidingPolicy: { '.default': 'mode' },
  maxPixels: 1e13,
  region: region.geometry().bounds()
});
