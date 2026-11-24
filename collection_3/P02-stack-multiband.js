/**
 * @name
 *      P02-stack-multiband.js
 * 
 * @description
 *      Script that stacks annual mining classification images from different periods
 *      into a single multiband image.
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

var lastYear = 2024;

var regionIds = [406];

var outputCollection = 'clasificacion';

var country = 'ECUADOR';

var outputVersion = 1;

var classId = 30;

var years = [
    //Period 1
    1985, 1986, 1987, 1988, 1989, 
    1990, 1991, 1992,
    
    //Period 2
    1993, 1994, 1995, 1996, 
    1997, 
    
    //Period 3
    1998, 1999, 2000, 
    2001, 2002, 
    
    //Period 4
    2003, 2004, 
    2005, 2006, 2007, 
    
    //Period 5
    2008, 2009, 2010, 2011, 2012, 
    
    //Period 6
    2013, 2014, 2015, 2016, 
    2017, 2018, 
    
    //Period 7
    2019, 2020,
    2021, 2022, 2023,
    
    //Last year
    2024
];

var assets = [
    'ECUADOR-406-1985-1986-1986-1987-1988-1989-1990-1991-1',
    'ECUADOR-406-1993-1994-1995-1996-1997-1',
    'ECUADOR-406-1998-1999-2000-2001-2002-1',
    'ECUADOR-406-2003-2004-2005-2006-2007-1',
    'ECUADOR-406-2008-2009-2010-2011-2012-1',
    'ECUADOR-406-2013-2014-2015-2016-2017-2018-1',
    'ECUADOR-406-2019-2020-2021-2022-2023-1',
    'ECUADOR-406-2024-1',
];

var bands = years.map(function(year) { return 'classification_' + year; });

var basePath = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/clasificacion';

var regionsPath = 'projects/mapbiomas-ecuador/assets/AUXILIAR-DATA/VECTOR/regionesClassif_Col3';

/**
 * Stack images
 */
var region = ee.FeatureCollection(regionsPath)
    .filter(ee.Filter.inList('id_region', regionIds));
  
var regionsRaster = region
    .reduceToImage(['id_region'], ee.Reducer.first());

var collection = assets.map(function(asset) {
    var image = ee.Image(basePath + '/' + asset);
    return image;
});

var output = ee.ImageCollection(collection)
    .toBands()
    .rename(bands)
    .byte();

print('Output image:', output);

/**
 * Export
 */
var filename = country + '-' + regionIds.join('-') + '-' + outputVersion;

Export.image.toAsset({
    image: output,
    description: filename,
    assetId: basePath + '/' + outputCollection + '/' + filename,
    scale: 30,
    pyramidingPolicy: {
        '.default': 'mode'
    },
    maxPixels: 1e13,
    region: region.geometry().bounds()
});

/**
 * Display to map
 */
bands.forEach(function(band) {
    var year = band.split('_')[1];
    
    Map.addLayer(
        output.select(band),
        {
            palette: 'lightgrey,darkred',
            min: 27,
            max: 30
        },
        'MINING - ' + year,
        false
    );
});

Map.addLayer(
    region,
    {},
    'REGION ' + regionIds.join('-'),
    false
);