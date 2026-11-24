
/**
 * @name
 *      P05-water-mask.js
 * 
 * @description
 *      Script that applies post-processing corrections to mining classification data,
 *      removing mining pixels that overlap with water bodies.
 * 
 * @authors
 *      MapBiomas Team
 * 
 * @theme
 *      Mining
 *    
 * @version
 *      1.0.0
 *
 * @Date
 *      2024
 */

var years = [
    2024
];

var inputName = 'ECUADOR-401-402-66';

var outputName = 'ECUADOR-401-402-77';

var polygons = geometry; // null

/**
 * Assets and palettes
 */
var palette = require('users/mapbiomas/modules:Palettes.js').get('classification9');

var remapWithPolygons = require('users/mapbiomasecuador/LULC:COLECCION3/api').functions.remapWithPolygons;

var regionsPath = 'projects/mapbiomas-raisg/DATOS_AUXILIARES/VECTORES/clasificacion-regiones-4';

var miningPath = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/clasificacion-ft/' + inputName;

var outputPath = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/preliminar';

var mosaicsPath = 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2';

var waterPath = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/GENERAL_MAP/CLASSIFICATION/classification-ft';

var waterNames = [
    'ECUADOR-40101-12',
    'ECUADOR-40102-11',
    'ECUADOR-40103-11',
    'ECUADOR-40104-10',
    'ECUADOR-40105-13',
    'ECUADOR-40201-12',
    'ECUADOR-40202-14',
    'ECUADOR-40203-11',
    'ECUADOR-40204-12',
    'ECUADOR-40205-10',
];

/**
 * Regions
 */
var regions = ee.FeatureCollection(regionsPath).filterMetadata('pais', 'equals', 'Ecuador');

/**
 * Mosaics
 */
var mosaics = ee.ImageCollection(mosaicsPath).filterBounds(regions);

/**
 * Prepare Water
 */
var waterPaths = waterNames.map(function(name) { return ee.Image(waterPath + '/' + name); });

var water = ee.ImageCollection(waterPaths).mosaic();

water = water.addBands(water.select(['classification_2023'], ['classification_2024']));

/**
 * Mining
 */
var mining = ee.Image(miningPath);

/**
 * Polygons mask
 */
var polygonsMask = null;

if (polygons) {
    var geometryMask = geometry
        .reduceToImage(['id'], ee.Reducer.first())
        .clipToBoundsAndScale(geometry, null, null, null, 30);
      
    polygonsMask = ee.Image(0)
        .clip(regions)
        .where(geometryMask.eq(1), 1);
  
    Map.addLayer(polygonsMask, {}, 'EXCLUSION MASK', false);
}

/**
 * Apply changes
 */
var outputBands = years.map(function(year) { return 'classification_' + year; });

var yearsMining = ee.ImageCollection(
    years.map(function(year) {
        var yearImage = mining.select('classification_' + year);
        var yearWater = water.select('classification_' + year);
        return polygons
            ? yearImage.where(yearImage.eq(30).and(yearWater.eq(33)).and(polygonsMask.eq(0)), 27)
            : yearImage.where(yearImage.eq(30).and(yearWater.eq(33)), 27);
    })
)
.toBands()
.rename(outputBands);

var output = mining.addBands(yearsMining, null, true);

print('Output image:', output);

/**
 * Display and export results
 */
years.forEach(function(year) {
    var selectedWater = water.select('classification_' + year);
    
    Map.addLayer(
        mosaics.filterMetadata('year', 'equals', year).mosaic().clip(regions),
        {
            min: 0,
            max: 4000,
            bands: 'swir1_median,nir_median,red_median'
        },
        'MOSAIC ' + year
    );
    
    Map.addLayer(
        mining.select('classification_' + year),
        {
            min: 0,
            max: palette.length - 1,
            palette: palette
        },
        'ORIGINAL ' + year
    );
    
    Map.addLayer(
        output.select('classification_' + year),
        {
            min: 0,
            max: palette.length - 1,
            palette: palette
        },
        'UPDATED ' + year
    );
    
    Map.addLayer(
        selectedWater.updateMask(selectedWater.eq(33)),
        {
            min: 0,
            max: palette.length - 1,
            palette: palette,
        },
        'WATER ' + year,
        false
    );
});

Export.image.toAsset({
    image: output.byte(),
    description: outputName,
    assetId: outputPath + '/' + outputName,
    region: regions.geometry().bounds(),
    scale: 30,
    maxPixels: 1e13,
});