/**
 * @name
 *      P07-remap-class-27.js
 *
 * @description
 *      Mining cross-cutting theme - MapBiomas Ecuador Collection 4.
 *      Step 7: final cleaning. Inside polygons drawn by the analyst, every
 *      year becomes 27 (other): mining (30) false positives found after the
 *      filters are removed.
 *
 * @usage
 *      1. Draw the polygons in the Code Editor (Planet NICFI basemaps can be
 *         shown as reference) and list them in PARAMS.remapAreas.
 *      2. Run, compare "Original <year>" and "Final cleaning <year>", and
 *         start the export task.
 *
 * @inputs
 *      <paths.pathMinigClasificationFilterAct><COUNTRY>-<regions>-<inputVersion>  (P06)
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

  // Years of the series (used in the charts).
  years: { first: 1985, last: 2025 },

  yearsPreview: [2000, 2023, 2024],

  inputVersion: 993,                // P06 spatial filter (outputVersion of P06)
  outputVersion: 992,               // same folder as the input: use a different version

  // FeatureCollections or Features drawn in the Code Editor: inside them
  // every year becomes 27. Example: [remapAreas]. [] = no change.
  remapAreas: [],

  // Planet NICFI monthly basemaps, only for visual reference (requires
  // access to the NICFI program).
  planet: {
    activate: false,
    year: 2023,
    months: [12]
  },

  // Area charts (ha) in the console: input, output and previous collection.
  charts: {
    show: true,
    classes: [30]
  },

  // *** CAUTION *** true deletes the existing asset with the same name before exporting.
  overwrite: false
};


// =============================================================================
// 2. MODULES, ASSETS AND CONSTANTS
// =============================================================================

var paths = require('users/mapbiomasecuador/LULC:COLECCION4/05-modules/CollectionDirectories.js').paths;
var palette = require('users/mapbiomasecuador/LULC:MODULES/Palettes.js').get('EcuadorCol4');

var PLANET_NICFI = 'projects/planet-nicfi/assets/basemaps/americas';

// General map of Collection 3, used only in the charts.
var PREVIOUS_COLLECTION_ASSET = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/INTEGRATION/ECUADOR-3';
var PREVIOUS_COLLECTION_YEARS = { first: 1985, last: 2024 };

var OTHER = 27;

var YEARS = [];
for (var y = PARAMS.years.first; y <= PARAMS.years.last; y++) { YEARS.push(y); }

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

/**
 * Line chart of the area (ha) of one class per year, at 250 m
 * (one 250 m pixel = 6.25 ha). Reference only: values are approximate.
 */
function areaChart(image, classId, region, xLabels, title) {
  return ui.Chart.image.regions({
    image: image.eq(classId).multiply(6.25).selfMask(),
    regions: region.geometry().bounds(),
    reducer: ee.Reducer.sum(),
    scale: 250,
    seriesProperty: 'system:id',
    xLabels: xLabels
  })
    .setChartType('LineChart')
    .setOptions({
      title: 'Class ' + classId + ' - ' + title + ' (250 m)',
      hAxis: { title: 'Year', titleTextStyle: { italic: false, bold: true } },
      vAxis: { title: 'Area (ha)', titleTextStyle: { italic: false, bold: true } },
      colors: ['#' + palette[classId]],
      lineSize: 2
    });
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

var input = ee.Image(paths.pathMinigClasificationFilterAct +
  PARAMS.country + '-' + regionsName + '-' + PARAMS.inputVersion)
  .updateMask(regionMask);

print('Input image', input);


// =============================================================================
// 5. FINAL CLEANING
// =============================================================================

var updated = input;

if (PARAMS.remapAreas.length > 0) {
  var remapAreas = mergeAll(PARAMS.remapAreas);

  // 1 inside the polygons, masked elsewhere.
  var polygonsMask = remapAreas
    .map(function (f) { return f.set('version', 1); })
    .reduceToImage(['version'], ee.Reducer.first())
    .clipToBoundsAndScale({ geometry: remapAreas.geometry(), scale: 30 });

  updated = input.where(polygonsMask.eq(1), OTHER);

  Map.addLayer(remapAreas.style({ fillColor: '00000000', color: 'ffff00' }), {}, 'Remap areas', false);
}

updated = updated.set({
  regions: regionsName,
  country: PARAMS.country,
  version: PARAMS.outputVersion,
  step: 'final cleaning'
});

print('Output image', updated);


// =============================================================================
// 6. MAP
// =============================================================================

Map.addLayer(region.style({ fillColor: 'FF000000', color: 'FF0000' }), {}, 'Regions ' + regionsName, false);

if (PARAMS.planet.activate) {
  addPlanetLayers(PARAMS.planet, region);
}

PARAMS.yearsPreview.forEach(function (year) {
  var yearMosaic = mosaics.filter(ee.Filter.eq('year', year)).mosaic().updateMask(regionMask);
  // Whole image with the year in `bands`: the Inspector shows every year.
  var vis = { bands: 'classification_' + year, min: 0, max: palette.length - 1, palette: palette };

  Map.addLayer(yearMosaic, MOSAIC_VIS, 'Mosaic ' + year, false);
  Map.addLayer(input.reproject('EPSG:4326', null, 30), vis, 'Original ' + year, false);
  Map.addLayer(updated.reproject('EPSG:4326', null, 30), vis, 'Final cleaning ' + year, false);
});


// =============================================================================
// 7. CHARTS
// =============================================================================

if (PARAMS.charts.show) {
  var previousCollection = ee.Image(PREVIOUS_COLLECTION_ASSET);

  var previousYears = [];
  for (var py = PREVIOUS_COLLECTION_YEARS.first; py <= PREVIOUS_COLLECTION_YEARS.last; py++) {
    previousYears.push(py);
  }

  print('Note: the charts are a reference only. Classifications are resampled ' +
        'from 30 m to 250 m to compute them, so use them with caution.');

  PARAMS.charts.classes.forEach(function (classId) {
    print(areaChart(input, classId, region, YEARS, 'Original'));
    print(areaChart(updated, classId, region, YEARS, 'Final cleaning'));
    print(areaChart(previousCollection, classId, region, previousYears, 'Collection 3 (general map)'));
  });
}


// =============================================================================
// 8. EXPORT
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
  image: updated.byte().reproject('EPSG:4326', null, 30),
  description: fileName,
  assetId: assetId,
  scale: 30,
  pyramidingPolicy: { '.default': 'mode' },
  maxPixels: 1e13,
  region: region.geometry().bounds()
});
