/**
 * @name
 *      P03-gapfill-filter.js
 *
 * @description
 *      Mining cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 3: gap fill filter. Fills the years with no mosaic data using the
 *      classification of the neighboring years.
 *
 *      1. Reads the stack of the regions (P02). Only pixels classified in at
 *         least one year are processed ("classified area"); inside it, any
 *         empty value becomes 27 (other).
 *      2. Optional exclusions: the classification of the excluded years, and
 *         of the excluded classes in every year, is discarded (it becomes a
 *         gap and is replaced by the gap fill).
 *      3. Years of the range missing from the stack are added with class 27.
 *      4. Pixels with no mosaic data in a year become a gap (years with no
 *         mosaic at all are a gap everywhere).
 *      5. Gap fill in two passes:
 *           - backward (tn -> t0): a gap takes the class of the next year,
 *           - forward  (t0 -> tn): gaps left at the end of the series take
 *             the class of the previous year.
 *
 *      Example of one pixel (- = no mosaic data):
 *          input:   30 30  -  - 27 27  -
 *          output:  30 30 27 27 27 27 27
 *
 * @usage
 *      1. Set PARAMS: regions, years, versions and exclusions.
 *      2. Run, review the preview years (mosaic, original, no-data mask,
 *         gap fill) and start the export task.
 *
 * @inputs
 *      - <paths.pathMinigClasificationAct><COUNTRY>-<regions>-<inputVersion>  (P02)
 *      - Annual mosaics (paths.mosaicRaisgAct and paths.mosaicPacificoAct).
 *
 * @outputs
 *      <paths.pathMinigClasificationFilterAct><COUNTRY>-<regions>-<outputVersion>
 *      bands 'classification_<year>': 30 = mining, 27 = other.
 *
 * @author
 *      Fabricio Garcés - EcoCiencia; MapBiomas Ecuador team
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

  // First and last year of the output. Must include every year of the input stack.
  years: { first: 1985, last: 2025 },

  yearsPreview: [2007, 2012, 2018],

  inputVersion: 997,                // P02 stack (outputVersion of P02)
  outputVersion: 996,

  // Classification discarded and replaced by the gap fill.
  exclusion: {
    classes: [],                    // classes discarded in every year, e.g. [30]
    years: []                       // years discarded with all classes, e.g. [2012]
  },

  // *** CAUTION *** true deletes the existing asset with the same name before exporting.
  overwrite: false
};


// =============================================================================
// 2. MODULES, ASSETS AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;
var palette = require('users/mapbiomasecuador/LULC:MODULES/Palettes.js').get('EcuadorCol4');

var OTHER = 27;

var MOSAIC_VIS = { bands: ['swir1_median', 'nir_median', 'red_median'], gain: [0.085, 0.05, 0.25] };
var NO_DATA_VIS = { min: 0, max: 1, palette: ['000000', 'ff0000'] };


// =============================================================================
// 3. FUNCTIONS
// =============================================================================

/**
 * Discards the classification of the excluded years (all classes) and of the
 * excluded classes (all years). Discarded pixels become gaps.
 */
function applyExclusion(image, exclusion) {
  exclusion.years.forEach(function (year) {
    var emptyBand = ee.Image(0).selfMask().byte().rename('classification_' + year);
    image = image.addBands(emptyBand, null, true);
  });

  exclusion.classes.forEach(function (classId) {
    image = image.updateMask(image.unmask().neq(classId));   // band by band
  });

  return image;
}

/**
 * Returns an image with exactly the bands `bandNames`, in that order. Bands
 * missing from `image` are added with class 27.
 */
function fillMissingBands(image, bandNames) {
  var existingBands = image.bandNames();
  var missingBands = ee.List(bandNames).removeAll(existingBands);

  print('Years without classification (filled with ' + OTHER + ')', missingBands);

  return ee.Image.cat(bandNames.map(function (band) {
    return ee.Image(ee.Algorithms.If(
      existingBands.contains(band),
      image.select([band]).byte(),
      ee.Image(OTHER).byte().rename([band])
    ));
  }));
}

/**
 * Returns 1 where the mosaic of the year has no data, 0 elsewhere.
 * If there is no mosaic for the year, every pixel is 1.
 */
function getNoDataMask(year, mosaics, region) {
  var yearMosaic = mosaics.filter(ee.Filter.eq('year', year)).mosaic();

  var noData = ee.Image(ee.Algorithms.If(
    yearMosaic.bandNames().size().gt(0),
    yearMosaic.select('blue_median').mask().not(),
    ee.Image(1)
  ));

  return noData.rename('mask_' + year).clip(region);
}

/**
 * Gap fill in two passes: backward (tn -> t0), then forward (t0 -> tn).
 */
function applyGapFill(image, bandNames) {
  bandNames = ee.List(bandNames);

  // Backward: each gap takes the (already filled) value of the next year.
  // Bands are added in reverse order: the last band is the most recent one filled.
  var reversed = bandNames.reverse();
  var backward = ee.Image(reversed.slice(1).iterate(function (bandName, previous) {
    previous = ee.Image(previous);
    var nextYear = previous.select(previous.bandNames().length().subtract(1));
    return previous.addBands(image.select(ee.String(bandName)).unmask(nextYear));
  }, image.select([reversed.get(0)])));

  // Forward: remaining gaps take the value of the previous year.
  // Bands are prepended: the first band is the most recent one filled.
  var forward = ee.Image(bandNames.slice(1).iterate(function (bandName, previous) {
    previous = ee.Image(previous);
    var previousYear = previous.select([0]);
    return backward.select(ee.String(bandName)).unmask(previousYear).addBands(previous);
  }, backward.select([bandNames.get(0)])));

  return forward.select(bandNames);
}


// =============================================================================
// 4. INPUTS
// =============================================================================

var regionsName = PARAMS.regionIds.join('-');

var region = ee.FeatureCollection(paths.pathMinigRegionAct)
  .filter(ee.Filter.inList('id_region', PARAMS.regionIds));

var regionMask = region
  .map(function (f) { return f.set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

var mosaics = ee.ImageCollection(paths.mosaicRaisgAct)
  .merge(ee.ImageCollection(paths.mosaicPacificoAct))
  .filter(ee.Filter.eq('country', PARAMS.country))
  .filterBounds(region);

var years = [];
for (var y = PARAMS.years.first; y <= PARAMS.years.last; y++) {
  years.push(y);
}
var bandNames = years.map(function (year) { return 'classification_' + year; });

var input = ee.Image(paths.pathMinigClasificationAct + PARAMS.country + '-' + regionsName + '-' + PARAMS.inputVersion)
  .updateMask(regionMask);


// =============================================================================
// 5. GAP FILL
// =============================================================================

// Classified area: pixels with a class in at least one year.
var classifiedArea = input.reduce(ee.Reducer.max()).gt(0).selfMask().rename('mask');

// Inside the classified area, empty values become 27.
var classification = input.unmask(OTHER).updateMask(classifiedArea);

classification = applyExclusion(classification, PARAMS.exclusion);

classification = fillMissingBands(classification, bandNames).updateMask(classifiedArea);

// No mosaic data -> gap.
var noDataMasks = ee.Image.cat(years.map(function (year) {
  return getNoDataMask(year, mosaics, region);
})).updateMask(classifiedArea);

classification = classification.updateMask(noDataMasks.not());

var gapfilled = applyGapFill(classification, bandNames)
  .set({
    step: 'gapfill',
    regions: regionsName,
    version: PARAMS.outputVersion,
    country: PARAMS.country
  });

print('Output image', gapfilled);


// =============================================================================
// 6. MAP
// =============================================================================

Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Regions ' + regionsName, false);

PARAMS.yearsPreview.forEach(function (year) {
  // Whole image with the year in `bands`: the Inspector shows every year.
  var vis = { bands: 'classification_' + year, min: 0, max: palette.length - 1, palette: palette };
  Map.addLayer(mosaics.filter(ee.Filter.eq('year', year)), MOSAIC_VIS, 'Mosaic ' + year, false);
  Map.addLayer(classification, vis, 'Original ' + year, false);
  Map.addLayer(noDataMasks.select('mask_' + year).selfMask(), NO_DATA_VIS, 'No mosaic data ' + year, false);
  Map.addLayer(gapfilled, vis, 'Gap fill ' + year, false);
});


// =============================================================================
// 7. EXPORT
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
  image: gapfilled.byte().reproject('EPSG:4326', null, 30),
  description: fileName,
  assetId: assetId,
  scale: 30,
  pyramidingPolicy: { '.default': 'mode' },
  maxPixels: 1e13,
  region: region.geometry().bounds()
});
