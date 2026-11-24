/**
 * @name
 *      P05-spatial-filter.js
 * 
 * @description
 *      Script that applies spatial filtering to mining classification data,
 *      removing isolated pixels based on connected component analysis.
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

var param = {
  country: 'ECUADOR',
  input: 'ECUADOR-406-4',
  output: 'ECUADOR-406-5',
  inputCollection: 'clasificacion-ft',
  regionIds: [406],
  years: [
    1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996,
    1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008,
    2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020,
    2021, 2022, 2023, 2024
  ],
  yearsPreview: [
    2023, 2024
  ],
  version: 4
};

// params
var country             = param.country;
var regionIds           = param.regionIds;
var input               = param.input;
var output              = param.output;
var inputCollection     = param.inputCollection;
var yearsPreview        = param.yearsPreview;
var optionalFilters     = param.optionalFilters;
var minConnectedPixel   = param.minConnectedPixels || 5;
var eightConnected      = true;
var years               = param.years;
var version             = param.version;

var palette             = require('users/mapbiomas/modules:Palettes.js').get('classification2');
palette[1]              = palette[6];
var vis                 = { min: 0, max: palette.length - 1, palette: palette };

// inputs
var regionsPath         = 'projects/mapbiomas-raisg/DATOS_AUXILIARES/VECTORES/clasificacion-regiones-4';
var inputPath           = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/' + inputCollection + '/';
var outputDir           = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/clasificacion-ft/';
var mosaicsAmazonPath   = 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2';
var mosaicsPacificPath  = 'projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2';

var image               = ee.Image(inputPath + input);
var amazonMosaics       = ee.ImageCollection(mosaicsAmazonPath);
var pacificMosaics      = ee.ImageCollection(mosaicsPacificPath);
var mosaics             = amazonMosaics.merge(pacificMosaics);
var regions             = ee.FeatureCollection(regionsPath);

var filteredMosaics = mosaics
  .filter(ee.Filter.inList('region_code', param.regionIds))
  .select(['swir1_median', 'nir_median', 'red_median']);

var filteredRegions = regions
  .filter(
    ee.Filter.or(
      ee.Filter.inList('id_region', regionIds),
      ee.Filter.inList('id_regionc', regionIds),
      ee.Filter.inList('id_regionC', regionIds)
    )
  );

var regionRaster = filteredRegions
  .map(function(item) { return item.set('version', 1); })
  .reduceToImage(['version'], ee.Reducer.first());

// get band names list
var bandNames = ee.List(
  years.map(function(year) {
    return 'classification_' + String(year);
  })
);

var classif = ee.Image();
var bandnameReg = image.bandNames();
var bands = bandnameReg.getInfo();
if (bands[0] === 'constant') {
  bands = bands.slice(1);
}

bands.forEach(function(bandName) {
  var imageYear = image.select(bandName);
  var band0 = imageYear.updateMask(imageYear.unmask().neq(0));
  classif = classif.addBands(band0.rename(bandName));
});

image = classif.select(bands).unmask().updateMask(regionRaster);

// generate a histogram dictionary of [bandNames, image.bandNames()]
var bandsOccurrence = ee.Dictionary(
  bandNames
    .cat(image.bandNames())
    .reduce(ee.Reducer.frequencyHistogram())
);

// insert a masked band
var bandsDictionary = bandsOccurrence.map(function(key, value) {
  var output = ee.Image(
    ee.Algorithms.If(
      ee.Number(value).eq(2),
      image.select([key]),
      ee.Image(27).rename([key])
    )
  );
  
  return output.byte();
});

// convert dictionary to image
var allBandsImage = ee.Image(
  bandNames.iterate(function(band, image) {
    var newImage = ee.Image(bandsDictionary.get(ee.String(band)));
    newImage = newImage
      .where(newImage.eq(0), 27)
      .where(newImage.eq(1), 30)
      .rename(ee.String(band));
    return ee.Image(image)
      .addBands(newImage)
      .updateMask(regionRaster);
  }, ee.Image().select())
);

var classificationImage = allBandsImage;

/**
 * Spatial filter
 * Calculate connected pixel count and filter isolated pixels
 */
var imageWithConnected = classificationImage.addBands(
  classificationImage
    .connectedPixelCount(100, eightConnected)
    .rename(bandNames.map(function(band) {
      return ee.String(band).cat('_connected');
    }))
);

var filteredResult = ee.Image(0).updateMask(regionRaster);

years.forEach(function(year) {
  var imageBand = imageWithConnected.select('classification_' + year);
  var connectedBand = imageWithConnected.select('classification_' + year + '_connected');
  
  // Calculate mode filter and mask pixels below threshold
  var mode = imageBand
    .focal_mode(1, 'square', 'pixels')
    .mask(connectedBand.lte(minConnectedPixel));
  
  var filteredYear = imageBand.blend(mode);
  
  filteredResult = filteredResult.addBands(filteredYear);
  
  return filteredResult;
});

/**
 * Visualizations
 */
Map.setOptions('SATELLITE');

filteredResult = filteredResult
  .select(bandNames)
  .updateMask(regionRaster);

var reprojected = filteredResult.reproject({
  crs: 'EPSG:4326',
  scale: 30
});

yearsPreview.forEach(function(year) {
  var selector = 'classification_' + year;
  
  var original = classificationImage.select(selector);
  var filtered = reprojected.select(selector);
  var mosaic = mosaics.filterMetadata('year', 'equals', year).mosaic();

  original = original.mask(original.eq(30));
  filtered = filtered.mask(filtered.eq(30));
  mosaic = mosaic.mask(regionRaster);
  
  Map.addLayer(
    mosaic,
    {
      bands: ['swir1_median', 'nir_median', 'red_median'],
      gain: [0.08, 0.06, 0.2]
    },
    'MOSAIC ' + year,
    false
  );
  
  Map.addLayer(
    original,
    vis,
    'ORIGINAL ' + year,
    false
  );
  
  Map.addLayer(
    filtered,
    vis,
    'FILTERED ' + year,
    false
  );
});

/**
 * Export to Earth Engine Asset
 */
filteredResult = filteredResult.select(bandNames)
  .set({
    code_region: regionIds,
    country: country,
    version: version,
    description: 'spatial filter',
    cover: 'mining'
  });

print('INPUT: ' + input, image);
print('OUTPUT: ' + output, filteredResult);

Export.image.toAsset({
  'image': filteredResult,
  'description': output,
  'assetId': outputDir + output,
  'pyramidingPolicy': {
    '.default': 'mode'
  },
  'region': filteredRegions.geometry().bounds(),
  'scale': 30,
  'maxPixels': 1e13
});