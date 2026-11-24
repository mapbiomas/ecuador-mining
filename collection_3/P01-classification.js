/**
 * @name
 *      P01-classification.js
 * 
 * @description
 *      Script for mining classification using random forest classifier
 *      based on satellite mosaics and sample points
 * 
 * @author
 *      MapBiomas Ecuador Team
 * 
 * @theme
 *      Mining
 *
 * @Date
 *      2025
 */
/**
 * Geometries Import
 */
var exclude = 
    /* color: #d63000 */
    /* shown: false */
    ee.Feature(
        ee.Geometry.Polygon(
            [[[-78.42661353846964, -3.590036239961511],
              [-78.4176013161796, -3.589350941647314],
              [-78.40893241664347, -3.5759875218731003],
              [-78.4109923531669, -3.568791753575815],
              [-78.4172579934257, -3.5710190212198625],
              [-78.4172579934257, -3.578814415401546],
              [-78.42481109401163, -3.5855817917312796]]]),
        {
          "id": 27,
          "system:index": "0"
        }),
    Areas_mineria_2024_SC = 
    /* color: #8b0000 */
    /* shown: false */
    ee.Geometry.MultiPolygon(
        [[[[-77.08862510730586, 0.19016314613577207],
           [-77.08846417476497, 0.19037772167378883],
           [-77.08818522502742, 0.19058156843241758],
           [-77.08818522502742, 0.19124675257541032],
           [-77.08677974750361, 0.1912896676805201],
           [-77.08656517078242, 0.1914720568760727],
           [-77.08427992870173, 0.1915149719806227],
           [-77.08488074352107, 0.19369291339498246],
           [-77.08940831233821, 0.1925342056820646],
           [-77.08976236392817, 0.1921694273116967],
           [-77.09014860202736, 0.19178855574947398],
           [-77.08980527927241, 0.19050646699531396],
           [-77.08957997371516, 0.19013095980483422]]],
         [[[-77.22735710485793, 0.1521988475902077],
           [-77.22737856253005, 0.15327172738411393],
           [-77.22789354666091, 0.1534004729557833],
           [-77.22862310751296, 0.15345411694375094],
           [-77.22864456518508, 0.1524670675436968],
           [-77.22823686941081, 0.1520754664196696]]]]),
    id_27_2024 = /* color: #64d64b */ee.Feature(
        ee.Geometry.MultiPoint(
            [[-78.54971672239667, -3.6259236542512694],
             [-78.54989911260968, -3.6256987996790038]]),
        {
          "id": 27,
          "system:index": "0"
        }),
    id_30_2024 = /* color: #e00000 */ee.Feature(
        ee.Geometry.MultiPoint(
            [[-78.54243315482844, -3.619488834973199],
             [-78.54243315482844, -3.619777935682547]]),
        {
          "id": 30,
          "system:index": "0"
        });
/**
 * Parameters
 */
var country = 'ECUADOR';
 
var outputVersion = 1;

var roi           = [Areas_mineria_2024_SC]; // Regions of interest for mining areas 2024

var noMiningGeoms = [id_27_2024]; // Non-mining geometries (ID 27)

var miningGeoms   = [id_30_2024]; // Mining geometries (ID 30)

var exclusions    = [ exclude ]; // Exclusion areas

var paths = require('users/mapbiomasecuador/LULC:COLECCION3/05-modules/CollectionDirectories.js').paths;

var mosaicsPath   = 'projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2' 

var bigRoiPath    = 'projects/mapbiomas-raisg/MUESTRAS/ECUADOR/COLECCION5/TRANSVERSALES/MINERIA/REFERENCIAS/ACUMULADO-VECTORIAL-ECUADOR-2020-2020-0';

var regionsPath   = paths.regionVectorAct;

var samplesPath   = 'projects/mapbiomas-raisg/MUESTRAS/ECUADOR/COLECCION5/TRANSVERSALES/MINERIA/PUNTOS/ECUADOR-401-402-2023-2';

var outputPath    = paths.pathMinigClasificationAct;

var featureSpace  = [
    "ndvi_median", 
    "ndfi_median", 
    "evi2_median", 
    "soil_median", 
    "savi_median",
    "npv_median", 
    "soil_amp", 
    "nuaci_median",
    "ndfib_median",
    "gvs_median",
    "gcvi_median",
    "pri_median",
    "ndwi_gao_median",
    "ndwi_mcfeeters_median"
];

var years = [ 
  
  ////// Period 1
  //    1985,1986,1986,1987,1988,1989,1990,1991,1992,
  ////// Period 2
  //    1993,1994,1995,1996,1997,
  ////// Period 3
  //    1998,1999,2000,2001,2002,
  ////// Period 4
  //    2003,2004,2005,2006,2007,
  ////// Period 5
  //    2008,2009,2010,2011,2012,
  ////// Period 6
  //    2013,2014,2015,2016,2017,2018,
  ////// Period 7
  //    2019,2020,2021,2022,2023
  ////// Period 8
  2024    
      ];

var regionIds = [ 401, 402 ];

/**
 * Data Preparation
 */

// Merge new ROIs with existing big ROI
var newRois = ee.FeatureCollection(roi);
var bigRoi = ee.FeatureCollection(bigRoiPath).merge(newRois);

// Filter regions by ID
var region = ee.FeatureCollection(regionsPath).filter(ee.Filter.inList('id_region', regionIds));

// Load and merge mosaic collections
var mosaics = ee.ImageCollection('projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2')
              .merge(ee.ImageCollection('projects/mapbiomas-raisg/MOSAICOS/mosaics-2'))
              .filterBounds(region);

// Load sample points and combine with manual geometries
var collectionPoints = ee.FeatureCollection(samplesPath).select(['reference'], ['id']);
var points = ee.FeatureCollection(miningGeoms.concat(noMiningGeoms)).merge(collectionPoints);

// Create exclusion mask
var exclusionLayer = ee.FeatureCollection(exclusions);
var exclusionImage = exclusionLayer.reduceToImage(['id'], ee.Reducer.first());
var exclusionMask = exclusionImage.clipToBoundsAndScale(exclusionLayer, null, null, null, 30);

// Initialize classified image variable
var classified;

// Visualization bands
var bandsvis = ["swir1_median","nir_median","red_median"];

/**
 * Processing - Iterate through years
 */
years
    .forEach(function(year, i) {
      
        var strYear = year.toString();
        
        // Get median mosaic for current year
        var yearMosaic = mosaics
            .filterMetadata('year', 'equals', year)
            .median()
            .clip(region);
        
        // Extract feature space bands and clip to big ROI
        var yearFeatureSpace = yearMosaic.select(featureSpace).clip(bigRoi);
        
        // Extract training samples
        var samples = yearFeatureSpace
            .sampleRegions({
                collection: points,
                properties: ['id'],
                scale: 30,
                projection: 'EPSG:4326',
                geometries: true
            });
        
        // Train Random Forest classifier
        var classifier = ee.Classifier
            .smileRandomForest({
                numberOfTrees: 100, 
                variablesPerSplit: 1
            })
            .train(samples, 'id', featureSpace);
        
        // Apply classification
        var classification = yearFeatureSpace
            .classify(classifier)
            .where(exclusionMask.eq(27), 27) // Apply exclusion mask (ID 27)
            .rename('classification_' + strYear);
        
        // Add band to multi-year image
        classified = i === 0 ? classification : classified.addBands(classification);
        
        // Visualize mosaic
        var mosaicvis = yearMosaic.select(bandsvis);
        Map.addLayer(mosaicvis, {
            min: 0, 
            max: 4000, 
            bands: 'swir1_median,nir_median,red_median'
        }, 'MOSAIC ' + strYear);
        
        // Visualize classification result
        Map.addLayer(classification, {
            min: 27, 
            max: 30, 
            palette: 'lightgrey,red'
        }, 'CLASSIFIED ' + strYear);
        
    });

// Generate output filename
var outputName = country + '-' + regionIds.join('-') + '-' + years.join('-') + '-' + outputVersion;

// Add metadata to classified image
classified = classified.set({
    regions: regionIds,
    country: country,
    version: outputVersion,
    trees: 100,
    samples_version: 1,
    description: 'preliminary classification',
});

// Export to asset
Export.image.toAsset({
    image: classified.byte(),
    description: outputName,
    assetId: outputPath + outputName,
    scale: 30,
    maxPixels: 1e13,
    region: region.geometry().bounds(),
    pyramidingPolicy: {'.default': 'mode'}
});