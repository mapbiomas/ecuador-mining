/**
 * @name
 *      P04-temporal-filter.js
 * 
 * @description
 *      Script that applies temporal filtering to mining classification data,
 *      using multi-year window filters to remove temporal inconsistencies.
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
  input: 'ECUADOR-406-2',
  output: 'ECUADOR-406-3',
  inputCollection: 'clasificacion-ft',
  regionIds: [406],
  years: [
    1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996,
    1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008,
    2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020,
    2021, 2022, 2023, 2024
  ],
  yearsPreview: [
    2024
  ],
  version: 4,
  optionalFilters: {
    fourYears: true,
    fiveYears: true
  }
};

// params
var country             = param.country;
var input               = param.input;
var output              = param.output;
var inputCollection     = param.inputCollection;
var regionIds           = param.regionIds;
var yearsPreview        = param.yearsPreview;
var optionalFilters     = param.optionalFilters;
var years               = param.years;
var version             = param.version;
var first               = [27];       // Filter for first year
var last                = [30];       // Filter for last year
var middle              = [30, 27];   // Filter for intermediate years

var palette             = require('users/mapbiomas/modules:Palettes.js').get('classification2');
palette[1]              = palette[6];
var vis                 = { min: 0, max: palette.length - 1, palette: palette };

// inputs
var outputDir           = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/clasificacion-ft/';
var regionsPath         = 'projects/mapbiomas-raisg/DATOS_AUXILIARES/VECTORES/clasificacion-regiones-4';
var inputPath           = 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/' + inputCollection + '/';
var mosaicsAmazonPath   = 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2';
var mosaicsPacificPath  = 'projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2';

var image               = ee.Image(inputPath + input);
var amazonMosaics       = ee.ImageCollection(mosaicsAmazonPath);
var pacificMosaics      = ee.ImageCollection(mosaicsPacificPath);
var mosaics             = amazonMosaics.merge(pacificMosaics);
var regions             = ee.FeatureCollection(regionsPath);

var filteredMosaics = mosaics
  .filter(ee.Filter.eq('country', country))
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

/**
 * Temporal mask functions
 */
var mask3 = function(value, year, image) {
  var prev = 'classification_' + (parseInt(year, 10) - 1);
  var curr = 'classification_' + (parseInt(year, 10));
  var next = 'classification_' + (parseInt(year, 10) + 1);
  
  var mask = image
    .select(prev).eq(value)
    .and(image.select(curr).neq(value))
    .and(image.select(next).eq(value));
  
  var modifiedImage = image.select(curr)
    .mask(mask.eq(1)).where(mask.eq(1), value);
  
  var outputImage = image
    .select(curr).blend(modifiedImage);
  
  return outputImage;
};

var mask4 = function(value, year, image) {
  var prev = 'classification_' + (parseInt(year, 10) - 1);
  var curr = 'classification_' + (parseInt(year, 10));
  var next = 'classification_' + (parseInt(year, 10) + 1);
  var next2 = 'classification_' + (parseInt(year, 10) + 2);
  
  var mask = image
    .select(prev).eq(value)
    .and(image.select(curr).neq(value))
    .and(image.select(next).neq(value))
    .and(image.select(next2).eq(value));
  
  var modifiedImg = image.select(curr)
    .mask(mask.eq(1)).where(mask.eq(1), value);
  
  var modifiedImg1 = image
    .select(next).mask(mask.eq(1)).where(mask.eq(1), value);
  
  var outputImage = image.select(curr).blend(modifiedImg).blend(modifiedImg1);
  
  return outputImage;
};

var mask5 = function(value, year, image) {
  var prev = 'classification_' + (parseInt(year, 10) - 1);
  var curr = 'classification_' + (parseInt(year, 10));
  var next = 'classification_' + (parseInt(year, 10) + 1);
  var next2 = 'classification_' + (parseInt(year, 10) + 2);
  var next3 = 'classification_' + (parseInt(year, 10) + 3);
  
  var mask = image
    .select(prev).eq(value)
    .and(image.select(curr).neq(value))
    .and(image.select(next).neq(value))
    .and(image.select(next2).neq(value))
    .and(image.select(next3).eq(value));
  
  var modifiedImg = image
    .select(curr).mask(mask.eq(1)).where(mask.eq(1), value);
  
  var modifiedImg1 = image
    .select(next).mask(mask.eq(1)).where(mask.eq(1), value);
  
  var modifiedImg2 = image
    .select(next2).mask(mask.eq(1)).where(mask.eq(1), value);
  
  var outputImage = image
    .select('classification_' + year)
    .blend(modifiedImg).blend(modifiedImg1).blend(modifiedImg2);
  
  return outputImage;
};

var years3 = [
  '1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994', '1995',
  '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004', '2005',
  '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014', '2015',
  '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023'
];

var years4 = years3.slice(0, -1);
var years5 = years4.slice(0, -1);

var window5years = function(image, value) {
  var outputImage = image.select('classification_1985');
  
  for (var i_year = 0; i_year < years5.length; i_year++) {
    var year = years5[i_year];
    outputImage = outputImage.addBands(mask5(value, year, image));
  }
  outputImage = outputImage.addBands(image.select('classification_2022'));
  outputImage = outputImage.addBands(image.select('classification_2023'));
  outputImage = outputImage.addBands(image.select('classification_2024'));
  
  return outputImage;
};

var window4years = function(image, value) {
  var outputImage = image.select('classification_1985');
  
  for (var i_year = 0; i_year < years4.length; i_year++) {
    var year = years4[i_year];
    outputImage = outputImage.addBands(mask4(value, year, image));
  }
  outputImage = outputImage.addBands(image.select('classification_2023'));
  outputImage = outputImage.addBands(image.select('classification_2024'));
  
  return outputImage;
};

var window3years = function(image, value) {
  var outputImage = image.select('classification_1985');
  
  for (var i_year = 0; i_year < years3.length; i_year++) {
    var year = years3[i_year];
    outputImage = outputImage.addBands(mask3(value, year, image));
  }
  
  outputImage = outputImage.addBands(image.select('classification_2024'));
  
  return outputImage;
};

var filtered = allBandsImage;

var mask3first = function(value, image) {
  var mask = image.select('classification_1985').neq(value)
    .and(image.select('classification_1986').eq(value))
    .and(image.select('classification_1987').eq(value));
  
  var modifiedImg = image.select('classification_1985')
    .mask(mask.eq(1)).where(mask.eq(1), value);
  
  var outputImage = image.select('classification_1985').blend(modifiedImg);
  
  outputImage = outputImage.addBands([
    image.select('classification_1986'),
    image.select('classification_1987'),
    image.select('classification_1988'),
    image.select('classification_1989'),
    image.select('classification_1990'),
    image.select('classification_1991'),
    image.select('classification_1992'),
    image.select('classification_1993'),
    image.select('classification_1994'),
    image.select('classification_1995'),
    image.select('classification_1996'),
    image.select('classification_1997'),
    image.select('classification_1998'),
    image.select('classification_1999'),
    image.select('classification_2000'),
    image.select('classification_2001'),
    image.select('classification_2002'),
    image.select('classification_2003'),
    image.select('classification_2004'),
    image.select('classification_2005'),
    image.select('classification_2006'),
    image.select('classification_2007'),
    image.select('classification_2008'),
    image.select('classification_2009'),
    image.select('classification_2010'),
    image.select('classification_2011'),
    image.select('classification_2012'),
    image.select('classification_2013'),
    image.select('classification_2014'),
    image.select('classification_2015'),
    image.select('classification_2016'),
    image.select('classification_2017'),
    image.select('classification_2018'),
    image.select('classification_2019'),
    image.select('classification_2020'),
    image.select('classification_2021'),
    image.select('classification_2022'),
    image.select('classification_2023'),
    image.select('classification_2024'),
  ]);
  
  return outputImage;
};

var mask3last = function(value, image) {
  var mask = image.select('classification_2022').eq(value)
    .and(image.select('classification_2023').eq(value))
    .and(image.select('classification_2024').neq(value));
  
  var modifiedImg = image.select('classification_2024')
    .mask(mask.eq(1)).where(mask.eq(1), value);
  
  var outputImage = image.select('classification_1985');
  
  outputImage = outputImage.addBands([
    image.select('classification_1986'),
    image.select('classification_1987'),
    image.select('classification_1988'),
    image.select('classification_1989'),
    image.select('classification_1990'),
    image.select('classification_1991'),
    image.select('classification_1992'),
    image.select('classification_1993'),
    image.select('classification_1994'),
    image.select('classification_1995'),
    image.select('classification_1996'),
    image.select('classification_1997'),
    image.select('classification_1998'),
    image.select('classification_1999'),
    image.select('classification_2000'),
    image.select('classification_2001'),
    image.select('classification_2002'),
    image.select('classification_2003'),
    image.select('classification_2004'),
    image.select('classification_2005'),
    image.select('classification_2006'),
    image.select('classification_2007'),
    image.select('classification_2008'),
    image.select('classification_2009'),
    image.select('classification_2010'),
    image.select('classification_2011'),
    image.select('classification_2012'),
    image.select('classification_2013'),
    image.select('classification_2014'),
    image.select('classification_2015'),
    image.select('classification_2016'),
    image.select('classification_2017'),
    image.select('classification_2018'),
    image.select('classification_2019'),
    image.select('classification_2020'),
    image.select('classification_2021'),
    image.select('classification_2022'),
    image.select('classification_2023'),
  ]);
  
  outputImage = outputImage
    .addBands(image.select('classification_2024').blend(modifiedImg));
  
  return outputImage;
};

/**
 * Implementation
 */
// Apply first year filter
for (var i_class = 0; i_class < first.length; i_class++) {
  var classId = first[i_class];
  filtered = mask3first(classId, filtered);
}

// Apply last year filter
for (var i_class = 0; i_class < last.length; i_class++) {
  var classId = last[i_class];
  filtered = mask3last(classId, filtered);
}

// Apply intermediate year filters
for (var i_class = 0; i_class < middle.length; i_class++) {
  var classId = middle[i_class];
  filtered = window4years(filtered, classId);
}

for (var i_class = 0; i_class < middle.length; i_class++) {
  var classId = middle[i_class];
  filtered = window3years(filtered, classId);
}

for (var i_class = 0; i_class < middle.length; i_class++) {
  var classId = middle[i_class];
  filtered = window5years(filtered, classId);
  filtered = window4years(filtered, classId);
}

for (var i_class = 0; i_class < middle.length; i_class++) {
  var classId = middle[i_class];
  filtered = window3years(filtered, classId);
}

// Apply optional filters
if (optionalFilters.fourYears && optionalFilters.fiveYears) {
  for (var i = 0; i < middle.length; i++) {
    var classId = middle[i];
    filtered = window4years(filtered, classId);
    filtered = window5years(filtered, classId);
  }
  
  for (var i_class = 0; i_class < middle.length; i_class++) {
    var classId = middle[i_class];
    filtered = window3years(filtered, classId);
  }
}

if (optionalFilters.fourYears) {
  for (var i = 0; i < middle.length; i++) {
    var classId = middle[i];
    filtered = window4years(filtered, classId);
  }
  
  for (var i_class = 0; i_class < middle.length; i_class++) {
    var classId = middle[i_class];
    filtered = window3years(filtered, classId);
  }
}

if (optionalFilters.fiveYears) {
  for (var i = 0; i < middle.length; i++) {
    var classId = middle[i];
    filtered = window5years(filtered, classId);
    filtered = window4years(filtered, classId);
  }
  
  for (var i_class = 0; i_class < middle.length; i_class++) {
    var classId = middle[i_class];
    filtered = window3years(filtered, classId);
  }
}

/**
 * Visualizations
 */
Map.setOptions('SATELLITE');

yearsPreview.forEach(function(year) {
  var selector = 'classification_' + year;
  
  var mosaic = filteredMosaics.filterMetadata('year', 'equals', year).mosaic();
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
  
  vis.bands = [selector];
  
  Map.addLayer(
    allBandsImage,
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
 * Export images to asset
 */
filtered = filtered.select(bandNames)
  .set({
    code_region: regionIds,
    country: country,
    version: version,
    description: 'temporal filter',
    cover: 'mining'
  });

print('INPUT: ' + input, allBandsImage);
print('OUTPUT: ' + output, filtered);

Export.image.toAsset({
  image: filtered,
  description: output,
  assetId: outputDir + output,
  pyramidingPolicy: { '.default': 'mode' },
  region: filteredRegions.geometry().bounds(),
  scale: 30,
  maxPixels: 1e13
});