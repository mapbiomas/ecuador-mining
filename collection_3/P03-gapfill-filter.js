/**
 * @name
 *      P03-gapfill-filter.js
 * 
 * @description
 *      Script that performs gap filling for mining classification time series,
 *      applying forward and backward filling to fill missing values.
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
  // Classification region and country
  regionId: '406', // '401-402'
  country: 'ECUADOR',
  mosaicRegions: [406],
   
  // Years to fix
  years: ee.List.sequence(1985, 2024).getInfo(),

  // Years for preview
  yearsPreview: [
      2023, 2024
  ],
  
  // Versions by cycle
  inputVersion: 1,
  outputVersion: 2,
  
  exclusion: {  // Indicate classes and years to exclude from the filter
    classes: [],  // List of classes to exclude in all years
    years: [],    // List of years to exclude with all classes
  },
  
  // Add mosaics
  addMosaics: true,
};

var GapFill = function(param) {
  
  var _this = this;
  
  this.init = function(param) {
    
    var config = {
      scaleNumber: 30,
      years: param.years,
      mapType: 'SATELLITE',
      collectionField: 'id_regionC',
      country: param.country,
      regionId: param.regionId,
      yearsPreview: param.yearsPreview,
      mosaicVersion: param.mosaicVersion,
      mosaicRegionId: param.mosaicRegionId,
      inputVersion: param.inputVersion,
      variables: param.variables || [],
      outputVersion: param.outputVersion,
      addMosaics: param.addMosaics,
      exclusion: param.exclusion,
      pacificMosaicPath: 'projects/mapbiomas-raisg/MOSAICOS/mosaics-2',
      amazonMosaicPath: 'projects/mapbiomas-raisg/MOSAICOS/mosaics-pathrow-2',
      functions: require('users/mapbiomasecuador/LULC:COLECCION3/api').functions,
      inputPath: 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/clasificacion',
      outputPath: 'projects/mapbiomas-ecuador/assets/MAPBIOMAS-LULC/COLLECTION3/CROSS_CUTTING_THEMES/MINING/STEP03-CLASSIFICATION/clasificacion-ft',
      regionPath: 'projects/mapbiomas-raisg/DATOS_AUXILIARES/VECTORES/clasificacion-regiones-4',
      palette: require("users/mapbiomas/modules:Palettes.js").get('classification7'),
      eePalette: require('users/gena/packages:palettes')
    };
    
    // functions
    var getRegion = config.functions.getRegion;
    
    // get region vector and raster based on region id
    var vector = ee.FeatureCollection(config.regionPath)
      .filter(ee.Filter.inList('id_region', param.mosaicRegions));
      
    var regionsRaster = vector
      .reduceToImage(['id_region'], ee.Reducer.first());
    
    // get mosaics
    var amazonMosaics = ee.ImageCollection(config.amazonMosaicPath);
    var pacificMosaics = ee.ImageCollection(config.pacificMosaicPath);
    var mosaics = amazonMosaics.merge(pacificMosaics).filterMetadata('country', 'equals', config.country);
    
    // get classification and apply gapfill
    var input = ee.Image(config.inputPath + '/' + config.country + '-' + config.regionId + '-' + config.inputVersion);
    var fullBands = config.years.map(function(year) { return 'classification_' + year; });
    var inputImage = input;
    print('Input image:', inputImage);
    print('Full bands:', fullBands);
    
    // Years to exclude
    var yearsExcludeImage = inputImage;
    inputImage = _this.maskExclusion(config.exclusion, inputImage);
    
    var gapfill = _this.applyGapFill(inputImage, fullBands);
    
    // Recover excluded images
    var yearsExclusion = config.exclusion.years;
    yearsExclusion.forEach(function(year) {
      print(year);
      var originalImage = yearsExcludeImage.select("classification_" + year);
      var filteredImage = gapfill.select("classification_" + year);
      var resultImage = filteredImage.blend(originalImage);
      gapfill = gapfill.addBands(resultImage, null, true);
    });
    
    // Year length
    var yearsL = config.yearsPreview.length;
    var yearTitle = ee.List(config.yearsPreview).get(0).getInfo();
    
    // Add Classification and GapFill to map
    Map.addLayer(input, {bands: ["classification_" + yearTitle], min: 0, max: 62, palette: config.palette}, 'Classification_original', false);
    Map.addLayer(inputImage, {bands: ["classification_" + yearTitle], min: 0, max: 62, palette: config.palette}, 'Input Image', false);
    Map.addLayer(gapfill, {bands: ["classification_" + yearTitle], min: 0, max: 62, palette: config.palette}, 'Gapfill', false);
    
    // display to map
    config.yearsPreview.map(function(year) {
      _this.addMosaic(mosaics, year, regionsRaster);
      _this.addClassification(yearsExcludeImage, year, config.palette, 'CLASSIFICATION');
      _this.addClassification(gapfill, year, config.palette, 'GAPFILL');
    });
    
    // Export asset
    var filename = config.country + '-' + config.regionId + '-' + config.outputVersion;
    var imageId = config.outputPath + '/' + filename;
    
    Export.image.toAsset({
      image: gapfill
        .byte()
        .set({
          step: 'gapfill'
        }),
      description: filename,
      assetId: imageId,
      scale: config.scaleNumber,
      pyramidingPolicy: {
        '.default': 'mode'
      },
      maxPixels: 1e13,
      region: vector.geometry().bounds()
    });
  };
  
  /**
   * Exclude years or classes
   */
  this.maskExclusion = function(exclusion, inputImage) {
    // Exclude years
    if (exclusion.years.length > 0) {
      var yearMaskExcl = ee.Image(0);
      exclusion.years.forEach(function(year) {
        yearMaskExcl = yearMaskExcl.addBands(ee.Image(0).rename('classification_' + String(year)));
      });
      yearMaskExcl = yearMaskExcl.slice(1).selfMask();
      inputImage = inputImage.addBands(yearMaskExcl, null, true);
    }
    
    // Exclude classes
    if (exclusion.classes.length > 0) {
      var inputImageBands = inputImage.bandNames().getInfo();
      inputImageBands.forEach(function(band) {
        exclusion.classes.forEach(function(classId) {
          var imageYear = inputImage.select(band);
          var imageExclusion = imageYear.updateMask(imageYear.unmask().neq(classId));
          inputImage = inputImage.addBands(imageExclusion, null, true);
        });
      });
    }
    
    return inputImage;
  };
  
  /**
   * Add mosaics to map
   */
  this.addMosaic = function(mosaics, year, regionMask) {
    var yearMosaic = mosaics
      .filterMetadata('year', 'equals', year)
      .median();
    
    yearMosaic.bandNames().size().evaluate(function(number) {
      if (number > 0) {
        yearMosaic = yearMosaic.updateMask(regionMask);
        Map.addLayer(
          yearMosaic,
          {
            bands: ['swir1_median', 'nir_median', 'red_median'],
            gain: '0.085,0.05,0.25'
          },
          'MOSAIC ' + year.toString(),
          false
        );
      }
    });
  };
  
  /**
   * Add classification to map
   */
  this.addClassification = function(image, year, palette, title) {
    ee.Number(year).evaluate(function(year) {
      Map.addLayer(
        image.select('classification_' + year),
        {
          min: 0,
          max: 62,
          palette: palette
        },
        title + ' ' + year,
        false
      );
    });
  };
  
  /**
   * Get mosaics collection
   */
  this.getMosaics = function(param) {
    var path = param.mosaicPath;
    var country = param.country;
    
    return ee.ImageCollection(path)
      .filter(ee.Filter.and(ee.Filter.eq('country', country)));
  };
  
  /**
   * Apply gapfill method
   * Performs backward then forward filling to fill missing values
   */
  this.applyGapFill = function(image, bandNames) {
    bandNames = ee.List(bandNames);
  
    // apply the gap fill from tn until t0 (backward fill)
    var bandNamesReversed = bandNames.reverse();
    var imageFilledBackward = bandNamesReversed.slice(1)
      .iterate(function(bandName, previousImage) {
        var currentImage = image.select(ee.String(bandName));
        previousImage = ee.Image(previousImage);
        currentImage = currentImage.unmask(
          previousImage.select(previousImage.bandNames().length().subtract(1)));
        return previousImage.addBands(currentImage);
      }, ee.Image(image.select([bandNamesReversed.get(0)])));
    
    imageFilledBackward = ee.Image(imageFilledBackward);
    
    // apply the gap fill from t0 until tn (forward fill)
    var imageFilledForward = bandNames.slice(1)
      .iterate(function(bandName, previousImage) {
        var currentImage = imageFilledBackward.select(ee.String(bandName));
        previousImage = ee.Image(previousImage);
        currentImage = currentImage.unmask(previousImage.select([0]));
        return currentImage.addBands(previousImage);
      }, ee.Image(imageFilledBackward.select([bandNames.get(0)])));
    
    imageFilledForward = ee.Image(imageFilledForward).select(bandNames);
    
    return imageFilledForward;
  };
  
  return this.init(param);
};

new GapFill(param);