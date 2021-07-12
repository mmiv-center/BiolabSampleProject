var workbook = {}; // raw excel document of each sheet
var tableData = {}; // structured table data read from workbook
var setup = {}; // specified by docx

import { setupPlotOnePlate } from './vizes/plotOnePlate.js';

function findTableOnSheet(sheet) {
    
    // parse for some meta data
    var output = { "wavelengths": 0, "plate_type": "", "data": {}, "date": "", "temperature": "" };
    for (var i = 0; i < sheet.length; i++) {
        var reg = new RegExp("Wavelengths:[ ]+(.*)$");
        var o = Object.values(sheet[i]);
        if ( o.length > 0) {
            if (o[0] == "Plate Number") {
                var rg = new RegExp("Plate[ ]*([0-9]+)$");
                var erg = o[1].match(rg);
                if (erg.length > 1) {
                    output["plate_number"] = erg[1];
                } else {
                    output["plate_number"] = o[1];
                }
            }
            if (o[0] == "Plate Type") {
                output["plate_type"] = o[1];
            }
            
            if (typeof(o[0]) == 'string') {
                var o2 = o[0].match(reg);
                if ( o2 != null && o2.length == 2) {
                    output["wavelengths"] = o2[1];
                }
            }
            if (o[0] == "Date") {
                function JSDateToExcelDate(inDate) {
                    var returnDateTime = 25569.0 + ((inDate. getTime() - (inDate. getTimezoneOffset() * 60 * 1000)) / (1000 * 60 * 60 * 24));
                    return returnDateTime.toString().substr(0,5);
                }
                function ExcelDateToJSDate(serial) {
                    var utc_days  = Math.floor(serial - 25569);
                    var utc_value = utc_days * 86400;                                        
                    var date_info = new Date(utc_value * 1000);
                 
                    var fractional_day = serial - Math.floor(serial) + 0.0000001;
                 
                    var total_seconds = Math.floor(86400 * fractional_day);
                 
                    var seconds = total_seconds % 60;
                 
                    total_seconds -= seconds;
                 
                    var hours = Math.floor(total_seconds / (60 * 60));
                    var minutes = Math.floor(total_seconds / 60) % 60;
                 
                    return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
                }                 
                output['date'] = ExcelDateToJSDate(o[1]).toLocaleDateString("en-US");
            }
            if (o[0] == "Actual Temperature:") {
                output['temperature'] = o[1];
            }
        }
    }
    
    // a table has a number of numeric records and starts
    // with a value of "A"
    var dataAsRows = {};
    var header = [];
    var tableColumn1 = [ "A", "B", "C", "D", "E", "F", "G", "H" ];
    for (var i = 0; i < sheet.length; i++) {
        var row = sheet[i];
        if (Object.keys(row).length >= 12) {
            var rowID = Object.values(row)[0];
            if (tableColumn1.indexOf(rowID) != -1) {
                if (rowID == "A") {
                    // look in the row before to get the header information
                    header = Object.values(sheet[i-1]);
                }
                console.log("row id : " + rowID);
                dataAsRows[rowID] = Object.values(row).slice(1);
            }
        }
    }
    // convert the array format to propper json column format
    var data = [];
    header.map(function(a) { 
        data[a] = {};
    });
    for (var i = 0; i < Object.keys(data).length; i++) {
        var column = Object.keys(data)[i];
        // we have columns now
        for ( var j = 0; j < Object.keys(dataAsRows).length; j++) {
            var rowID = Object.keys(dataAsRows)[j];
            data[column][rowID] = dataAsRows[rowID][i];
        }
    }
    output["data"] = data;
    return output;
}

function showSetup(setup) {
    // add something to #setup
    // setup.concentration
    // setup.participantByPlate
    var lnConcentration = Object.keys(setup.concentration).map(function(k) { 
        var o = {}; 
        o[k] = Math.log2(setup.concentration[k]).toFixed(3);
        return o;
    });
    jQuery('#setup').children().remove();
    jQuery('#setup').append("<div class='list'>Concentration values per row: " + Object.keys(setup.concentration).map(function(x) { 
        return x + " = " + setup.concentration[x];
    }).join(", ") + "</div>");
    //jQuery('#setup').append("<div class='list'>" + JSON.stringify(lnConcentration) + "</div>");
    //jQuery('#setup').append("<div class='list'>" + JSON.stringify(setup.participantsByPlate) + "</div>");
    
}

var docx4js = null;

function handleDrop(e) {
    jQuery("#message").val("got a spreadsheet now...")
    e.stopPropagation(); e.preventDefault();
    // event could be not in dataTransfer
    if (typeof e.dataTransfer == "undefined")
    e = e.originalEvent;
    var files = e.dataTransfer.files;
    var allfilenames = "";
    for (var fileNum = 0; fileNum < files.length; fileNum++) {
        allfilenames += files[fileNum].name;
        if (fileNum < files.length-1) {
            allfilenames += ", ";
        }
    }
    jQuery("#filename").text(allfilenames);
    for (var fileNum = 0; fileNum < files.length; fileNum++) {
        var f = files[fileNum];
        
        // We can have a xlsx or a docx here. Try to find out and use the correct
        // method to read each one.
        var fileType = "xlsx";
        if (f.name.match(/.docx$/) != null) {
            fileType = "docx";
        } else if (f.name.match(/.xlsx$/) != null) {
            fileType = "xlsx";
        } else {
            alert("error: the uploaded file's file extension is neither .docx nor .xlsx.");
            return;
        }
        if (fileType == "docx") { // docx document
            setup = {};
            var concentration = {};
            var lastChar = "";
            var afterTableText = "";
            var storeAll = false;
            var sampleRowText = "";
            var sampleRowContent = [];
            docx4js.load(f).then(function(docx){
                var models=[], go={visit(){}}
                docx.parse(docx4js.createVisitorFactory(function(identifiedWordModel){
                    if(identifiedWordModel.type) {
                        models.push(identifiedWordModel.type)
                        if (sampleRowText.length > 0 && identifiedWordModel.type == "cell") {
                            sampleRowContent.push(sampleRowText);
                            sampleRowText = "";
                        }
                        if (identifiedWordModel.type == "text") {
                            
                            // if we are in the first row of the table we can read all text into one string (until the first A column)
                            if (Object.keys(concentration).length == 0) {
                                sampleRowText += identifiedWordModel.getText();
                            }
                            
                            // if the last text found was "A" the next text will be the
                            // concentration for column A
                            var alphas = [ "A", "B", "C", "D", "E", "F", "G", "H"];
                            if (alphas.indexOf(identifiedWordModel.getText())!= -1) {
                                lastChar = identifiedWordModel.getText();
                            } else {
                                if (lastChar != "") {
                                    concentration[lastChar] = identifiedWordModel.getText();
                                }
                                lastChar = "";
                            }
                            if (storeAll && identifiedWordModel.getText() != ":") {
                                afterTableText += identifiedWordModel.getText();
                            }
                            if (identifiedWordModel.getText() == "Anti-NP staining")
                            storeAll = true;
                            console.log("text found: " + identifiedWordModel.getText());
                        }
                    }
                    return go
                }))
                // we can split up the sampleRowText
                sampleRowContent = sampleRowContent.slice(0,12);
                console.log("show the sampleRowText: " + sampleRowContent.join(","));
                
                // now split the afterTableText
                var parts = afterTableText.split("//");
                var participantsByPlate = {};
                for (var i = 0; i < parts.length; i++) {
                    var pp = parts[i].split(":");
                    var pices = pp[1].trim().split(",");
                    participantsByPlate[pp[0]] = pices.map(function(a) {
                        var b = a.trim().split(/[ ]+/g);
                        return { "name": b[0].trim(), "timepoint": b[1].trim() }
                    });
                }
                // Here we have two participants per key, like P1-2. Lets double the entries and
                // make them unique for each plate.
                var participantsByPlate2 = {};
                var plateMapping = {};
                for (var i = 0; i < Object.keys(participantsByPlate).length; i++) {
                    var key = Object.keys(participantsByPlate)[i];
                    var re = new RegExp("P([0-9]+)-([0-9]+)$");
                    var erg = key.match(re);
                    if (erg.length > 2) {
                        participantsByPlate2[erg[1]] = participantsByPlate[key];
                        participantsByPlate2[erg[2]] = participantsByPlate[key];
                        plateMapping[erg[1]] = erg[2];
                        plateMapping[erg[2]] = erg[1];
                    } else {
                        participantsByPlate2[key] = participantsByPlate[key];
                    }
                }
                
                setup = { 
                    "columnContent": sampleRowContent, 
                    "concentration": concentration, 
                    "participantsByPlate": participantsByPlate2, 
                    "plateMapping": plateMapping 
                };
                showSetup(setup);
                computeTable();
            })
        } else { // .xlsx spreadsheet
            var reader = new FileReader();
            reader.onload = function(e) {
                var data = new Uint8Array(e.target.result);
                workbook = XLSX.read(data, {type: 'array'});
                tableData = {};
                for (var i = 0; i < Object.keys(workbook.Sheets).length; i++) {
                    var k = Object.keys(workbook.Sheets)[i];
                    var j = XLSX.utils.sheet_to_json(workbook.Sheets[k]);
                    tableData[k] = findTableOnSheet(j); // we should keep that information around
                    var plate_number = tableData[k]["plate_number"];
                    var wavelength = tableData[k]["wavelengths"];
                    var temperature = tableData[k]["temperature"];
                    var date = tableData[k]["date"];
                    // set a background color based on plate number and wavelength
                    jQuery('#out').append("<div class='plate' plate-nr='" + 
                        plate_number + "' wavelength='" + 
                        wavelength + "'>" + 
                        "<div class='pn'>" + k + "</div>" + 
                        "<div class='da'>" + date + "</div>" + 
                        "<div class='te'>" + temperature + "&#8451;</div>" + 
                        "<div class='wl'>" + wavelength + "nm</div>" + 
                        "</div>");
                }
                computeTable();
            };
            reader.readAsArrayBuffer(f);
          
        }
    }
}

function computeTable() {
    // run this only if both data files have been read
    if (typeof(setup.columnContent) !== 'undefined' && Object.keys(tableData).length > 0) {
        // test create for all entries - only call this once
        if (computeAllFlag) {
            computeAllFlag = false; // and never again
            computeForAllPlates(setup, true);
        } 
    }
}

var platePairs = [];
// fill in the master table on the page
function computeForAllPlates(setup, init) {
    // walk through all the plate pairs
    if (init) {
        jQuery('#master-table').append("<table class='table table-striped table-sm table-hover'><thead><tr><th>Participant</th>" +
        "<th>Timepoint</th><th>First plate</th><th>Second plate</th>" +
        "<th class='text-right'>Virus control</th><th class='text-right'>Cell control</th>" +
        "<th class='text-right'>log<sub>2</sub>(IC<sub>50</sub>)</th><th class='text-right'>IC<sub>50</sub></th>" +
        "<th class='text-right' title='Goodness of fit (1.0 for perfect)'>R<sup>2</sup></th></tr></thead><tbody id='master-table-body'></tbody></table>");
        var tmpPlatePairs = [];
        Object.keys(setup.plateMapping).map(function(x) { 
            var ar = [x, setup.plateMapping[x]].sort(function(a,b) { return b - a; });
            tmpPlatePairs[ar[0]] = ar[1];
        });
        tmpPlatePairs.map(function(x,idx) {
            platePairs.push([idx, +x]);
        });
    }
    if (platePairs.length < 1) {
        // if this was the last time we should be able to trigger a button click
        setTimeout(function() { 
            jQuery('#out').find(".plate").first().trigger('click');
        }, 500);
        return; // and we are done
    }
    // run the first plate pair
    var pair1 = platePairs.shift();
    //for (var i = 0; i < platePairs.length; i++) {
        var plate = null;
        var plateNr = pair1[0];
        for (var i = 0; i < Object.keys(tableData).length; i++) {
            var key = Object.keys(tableData)[i];
            if (tableData[key]["plate_number"] == plateNr) {
                plate = tableData[key];
            }
        }
        if (plate == null) {
            console.log("Error: could not find that plate");
            computeForAllPlates(setup, false);
            return;
        }
        //console.log("we found that plate as :" + JSON.stringify(plate));
        
        // sister plate is
        
        var plate2Number = setup.plateMapping[plate.plate_number];
        var plate2 = null;
        for (var i = 0; i < Object.keys(tableData).length; i++) {
            var key = Object.keys(tableData)[i];
            if (tableData[key]["plate_number"] == plate2Number) {
                plate2 = tableData[key];
            }
        }
        if (plate2 == null) {
            console.log("no plate2!");
        }
        setup.cutoff_single_replication = jQuery('#replicationThreshold').val();
        Promise.all(fitFunctions(plate, plate2, setup)).then(function() {
            setup['function_fits'] = parameter; // a global parameter
            // add a table
            var tab = "";
            for (var i = 0; i < setup['function_fits'].length; i++) {
                if (typeof (setup['function_fits'][i].type) !== 'undefined') continue;
                
                // the plate numbers repeat so we only have to look at one of them, but
                // each one is a double based on the timepoint string, there is no easy way
                // to split the timepoint (can be 2 or 3 single character numbers).
                // i goes from 0 to 2*length of the participantsByPlate entries
                //var idx = Math.floor(i/2);
                var n = "";
                var t = "";
                //if (idx < setup.participantsByPlate[plateNr].length) {
                // identify the timepoint for column i by counting how many numbers we have after the T
                var numTs = 0;
                var thisNameIdx = -1;
                var timepointNumber = -1;
                for (var j = 0; j <= i; j++) {
                    if (typeof(setup.participantsByPlate[plateNr][j]) == 'undefined')
                    break;
                    var newN = setup.participantsByPlate[plateNr][j].timepoint.length-1; 
                    if (numTs + newN > i) {
                        thisNameIdx = j;
                        timepointNumber = setup.participantsByPlate[plateNr][j].timepoint[1+i-numTs];
                        break;
                    }
                    numTs += setup.participantsByPlate[plateNr][j].timepoint.length-1;
                }
                
                if (thisNameIdx != -1) {
                    n = setup.participantsByPlate[plateNr][thisNameIdx].name;
                    t = "T"+timepointNumber;
                }
                //}
                var colorIdx = Math.max(0,Math.round(parameter[i].R2 * 8));
                tab = tab + "<tr><td>" + n + "</td><td>" +
                t + "</td><td>" +
                plate.plate_number + "</td><td>" +
                (plate2!==null?plate2.plate_number:"") + "</td><td class='text-right'>" +
                parameter[0].max.mean.toFixed(4) + "</td><td class='text-right'>" +
                parameter[0].min.mean.toFixed(4) + "</td><td class='text-right'>" +
                parameter[i].b.toFixed(5) + "</td><td class='text-right'>" +
                Math.pow(2, parameter[i].b).toFixed(2) + "</td><td class='text-right' style='background-color: " + colorbrewer["RdYlGn"][9][colorIdx] + ";'>" +
                parameter[i].R2.toFixed(3) + "</td></tr>";
            }
            jQuery('#master-table-body').append(tab);
            computeForAllPlates(setup, false);
        });
    //}
}

function plotOnePlate(plateNr) {
    // plot a single table again
    console.log("plot a plate: " + plateNr);
    // find the correct plate
    var plate = null;
    for (var i = 0; i < Object.keys(tableData).length; i++) {
        var key = Object.keys(tableData)[i];
        if (tableData[key]["plate_number"] == plateNr) {
            plate = tableData[key];
        }
    }
    if (plate == null) {
        console.log("Error: could not find that plate");
        return;
    }
    //console.log("we found that plate as :" + JSON.stringify(plate));
    
    // sister plate is
    
    var plate2Number = setup.plateMapping[plate.plate_number];
    var plate2 = null;
    for (var i = 0; i < Object.keys(tableData).length; i++) {
        var key = Object.keys(tableData)[i];
        if (tableData[key]["plate_number"] == plate2Number) {
            plate2 = tableData[key];
        }
    }
    
    // start creating a visualization for that plate
    // lets trigger the vizes/plotOnePlate.js
    // import * as THREE from './three.module.js';
    //import { setupPlotOnePlate } as setupPlotOnePlate from './vizes/plotOnePlate.js'; 
    setup.cutoff_single_replication = jQuery('#replicationThreshold').val();

    // we should compute the function fit for each of the plate pairs
    Promise.all(fitFunctions(plate, plate2, setup)).then(function() {
        setup['function_fits'] = parameter; // a global parameter
        // add a table
        var tab = "<table class='table table-striped table-sm table-hover'><thead><tr><th>Participant</th>" +
        "<th>Timepoint</th><th>First plate</th><th>Second plate</th>" +
        "<th class='text-right'>Virus control</th><th class='text-right'>Cell control</th>" +
        "<th class='text-right'>log<sub>2</sub>(IC<sub>50</sub>)</th><th class='text-right'>IC<sub>50</sub></th>" +
        "<th class='text-right' title='Goodness of fit (1.0 for perfect)'>R<sup>2</sup></th></tr></thead><tbody>";
        for (var i = 0; i < setup['function_fits'].length; i++) {
            if (typeof (setup['function_fits'][i].type) !== 'undefined') continue;
            
            // the plate numbers repeat so we only have to look at one of them, but
            // each one is a double based on the timepoint string, there is no easy way
            // to split the timepoint (can be 2 or 3 single character numbers).
            // i goes from 0 to 2*length of the participantsByPlate entries
            //var idx = Math.floor(i/2);
            var n = "";
            var t = "";
            //if (idx < setup.participantsByPlate[plateNr].length) {
            // identify the timepoint for column i by counting how many numbers we have after the T
            var numTs = 0;
            var thisNameIdx = -1;
            var timepointNumber = -1;
            for (var j = 0; j <= i; j++) {
                if (typeof(setup.participantsByPlate[plateNr][j]) == 'undefined')
                break;
                var newN = setup.participantsByPlate[plateNr][j].timepoint.length-1; 
                if (numTs + newN > i) {
                    thisNameIdx = j;
                    timepointNumber = setup.participantsByPlate[plateNr][j].timepoint[1+i-numTs];
                    break;
                }
                numTs += setup.participantsByPlate[plateNr][j].timepoint.length-1;
            }
            
            if (thisNameIdx != -1) {
                n = setup.participantsByPlate[plateNr][thisNameIdx].name;
                t = "T"+timepointNumber;
            }
            //}
            var colorIdx = Math.max(0,Math.round(parameter[i].R2 * 8));
            tab = tab + "<tr><td>" + n + "</td><td>" +
            t + "</td><td>" +
            plate.plate_number + "</td><td>" +
            (plate2!=null?plate2.plate_number:"") + "</td><td class='text-right'>" +
            parameter[0].max.mean.toFixed(4) + "</td><td class='text-right'>" +
            parameter[0].min.mean.toFixed(4) + "</td><td class='text-right'>" +
            parameter[i].b.toFixed(5) + "</td><td class='text-right'>" +
            Math.pow(2, parameter[i].b).toFixed(2) + "</td><td class='text-right' style='background-color: " + colorbrewer["RdYlGn"][9][colorIdx] + ";'>" +
            parameter[i].R2.toFixed(3) + "</td></tr>";
            // the two plates are plateNr and plate2Number
            /*jQuery('#res').append("<div class='result'>" + "Column: " + i + 
            " log concentration at 50% is: " + parameter[i].b.toFixed(5) + 
            " in non-log units: " + Math.pow(2, parameter[i].b).toFixed(5) +
            " R^2 is: " + parameter[i].R2.toFixed(3) + "</div>");  // test for randomnes of the residuals Wald Wolfowitz Runs Test */
        }
        tab += "<tbody></table>";
        jQuery('#res').append(tab);
        setupPlotOnePlate(plate, plate2, setup);
    });
}
var parameter = [];

function fitFunctions(plate, plate2, setup) {
    // we compute function for each plate pair
    
    var firstRow = plate.data[Object.keys(plate.data)[0]];
    var numWells = Object.keys(firstRow).length;
    var numRecords = Object.keys(plate.data).length;
    // keep all the numbers together
    var data = { x: [], y: [] }; // x is a list of numbers, y is a list of lists of numbers
    for (const k in setup.concentration) {
        data.x.push(Math.log2(setup.concentration[k])); 
    }
    for (var i = 0; i < numRecords; i++) { // we get 12 arrays with 2 arrays each of length 8
        var pair = [new Array(data.x.length), new Array(data.x.length)];
        data.y.push(pair); 
    }
    
    for ( let z = 0; z < numWells; ++ z ) {
        for ( let x = 0; x < numRecords; ++x ) {
            var ks = Object.keys(plate.data); // "1", ...
            var w = ks[x];
            var ks2 = Object.keys(firstRow);
            var v = ks2[z];
            var val = plate.data[w][v]; // 0..1?
            data.y[x][0][z] = val;
        }
    }
    if (plate2 !== null) {
        for ( let z = 0; z < numWells; ++ z ) {
            for ( let x = 0; x < numRecords; ++x ) {
                var ks = Object.keys(plate2.data); // "1", ...
                var w = ks[x];
                var ks2 = Object.keys(firstRow);
                var v = ks2[z];
                var val = plate2.data[w][v]; // 0..1?
                data.y[x][1][z] = val;
            }
        }
    }
    // ok, should have all the values in there now
    var params = {
        max: 0,
        min: 0,
        a: 0,
        b: 0,
        R2: 0
    };
    // we want to fit those for all y pairs
    parameter = [];
    for (var i = 0; i < data.y.length; i++) {
        parameter.push(Object.assign({}, params));
    }
    // compute the virus and cell min/max values for each function
    // should we do this robust?
    var target = "Virus control";
    var idxVirus = setup.columnContent.indexOf(target);
    if (idxVirus != -1) {
        var d = robustMean([...data.y[idxVirus][0], ...data.y[idxVirus][1]], 2.0); // factor for stdMultiple
        for (var i = 0; i < parameter.length; i++) {
            parameter[i].max = d;
        }
    }
    target = "Cell control";
    var idxCell = setup.columnContent.indexOf(target);
    // var q = quantiles([...data.y[idxCell][0], ...data.y[idxCell][1]], [0.25, 0.5, 0.75]);
    // setup.cutoff_single_replication

    if (idxCell != -1) {
        // remove any values above 0.14 (but lets use the lower quartile value)
        var d = robustMean([...data.y[idxCell][0], ...data.y[idxCell][1]].filter(function(a) { if (a > setup.cutoff_single_replication) return false; return true; }), 2.0); // factor for stdMultiple
        //d['cutoff_q_50'] = q[1];
        d['cutoff_single_replication'] = setup.cutoff_single_replication;
        for (var i = 0; i < parameter.length; i++) {
            parameter[i].min = d;
        }
    }
    parameter[idxVirus].type = "Virus control";
    parameter[idxCell].type = "Cell control";
    
    jQuery('#res').children().remove();
    jQuery('#res').append("<div class='list'>Virus control: " + 
        Object.keys(parameter[0].max).map(function(x) {
            var v = parameter[0].max[x];
            if (v > 0 && v < 1) {
                v = v.toFixed(5);
            }
            return x + " = " + v;
        }).join(", ") + "<br/>Cell control: " + 
        Object.keys(parameter[0].min).map(function(x) {
            var v = parameter[0].min[x];
            if (v > 0 && v < 1) {
                v = (+v).toFixed(5);
            }
            return x + " = " + v;
        }).join(", ") + "</div>" );
    // ok, now we have a min and max for each curve fit
    const promises = [];
    for (var i = 0; i < parameter.length; i++) {
        // don't do this for cell and virus
        if (i == idxVirus || i == idxCell)
          continue;
        
        var eq_obj = amd_cf.getEquation('js/sigmoidFunc.jseo');
        eq_obj.catch(function (err) {
            console.error('Something is wrong with the equation:', err);
        });
        var data2 = {
            x_values: data.x.map(function(a) { return [0+a]; }),
            y_values: data.y[i][0].map(function(a,idx) { // just the average value?
                var avg = (a + data.y[i][1][idx])/2.0;
                return (avg - parameter[i].min.mean)/(parameter[i].max.mean - parameter[i].min.mean); // so that all values start at 0 and go to max-min
            }),
            fit_params: {
                checkItt: 3,
                maxItt: 200
            },
            other: i
        };
        var prom = eq_obj.fit(data2).then(function(res) {
            //console.log('Done With 2', res);
            //console.log("The log concentration at 50% is: " + res.parameters[1] + " in non-log units: " + Math.pow(2, res.parameters[1]));
            var i = res.data.other;
            parameter[i].a = res.parameters[0];
            parameter[i].b = res.parameters[1];
            parameter[i].R2 = res.R2>0?res.R2:0;
        }).catch(function(err) {
            console.error('2 did not work:', err);
        });
        promises.push(prom);
    }
    // We cannot simply return  thhe parameter here. We need to wait or the promises to finish
    
    return promises;
}

function robustMean(ar, sigma) {
    var mean = ar.reduce(function(a, b) { return a+b; },0)/(ar.length);
    var std = Math.sqrt(ar.reduce(function(a, b) { return ((a-mean)*(a-mean))+b; },0)/(ar.length-1));
    // recompute the mean removing all outliers
    var stdMultiple = sigma; // 2.0;
    var outliers = ar.map(function(a) { 
        if ( Math.abs(a-mean) > stdMultiple*std) {
            return 1;
        }
        return 0;
    });
    //console.log("Number of outliers (" + stdMultiple + " x std) is : " + outliers.reduce(function(a,b) { return a+b; }));
    var ar_non_outliers = ar.filter(function(a,idx) { 
        if (outliers[idx] == 1)
        return false;
        return true;
    });
    console.log("AR IS HERE: " + JSON.stringify(ar));
    return { 
        mean: ar_non_outliers.reduce(function(a,b) {
            return a+b;
        },0)/(ar_non_outliers.length),
        outliers: outliers.reduce(function(a,b) { return a+b; },0),
        N: ar.length
    };
}

function quantiles(values, ps) {
    var sortedValues = values.sort(function(a,b) {
        return a - b;
    });
    return ps.map(function(x) { 
        return quantileSorted(sortedValues, x);
    });
}

//Credit D3: https://github.com/d3/d3-array/blob/master/LICENSE
function quantileSorted(values, p, fnValueFrom) {
    var n = values.length;
    if (!n) {
        return;
    }
    
    fnValueFrom =
    Object.prototype.toString.call(fnValueFrom) == "[object Function]"
    ? fnValueFrom
    : function (x) {
        return x;
    };
    
    p = +p;
    
    if (p <= 0 || n < 2) {
        return +fnValueFrom(values[0], 0, values);
    }
    
    if (p >= 1) {
        return +fnValueFrom(values[n - 1], n - 1, values);
    }
    
    var i = (n - 1) * p,
    i0 = Math.floor(i),
    value0 = +fnValueFrom(values[i0], i0, values),
    value1 = +fnValueFrom(values[i0 + 1], i0 + 1, values);
    
    return value0 + (value1 - value0) * (i - i0);
}

function downloadCSV(csv, filename) {
    var csvFile;
    var downloadLink;

    // CSV file
    csvFile = new Blob([csv], {type: "text/csv"});

    // Download link
    downloadLink = document.createElement("a");

    // File name
    downloadLink.download = filename;

    // Create a link to the file
    downloadLink.href = window.URL.createObjectURL(csvFile);

    // Hide download link
    downloadLink.style.display = "none";

    // Add the link to DOM
    document.body.appendChild(downloadLink);

    // Click download link
    downloadLink.click();
}

function exportTableToCSV(filename) {
    var csv = [];
    var rows = document.querySelectorAll("#master-table tr");
    
    for (var i = 0; i < rows.length; i++) {
        var row = [], cols = rows[i].querySelectorAll("td, th");
        
        for (var j = 0; j < cols.length; j++) 
            row.push(cols[j].innerText);
        
        csv.push(row.join(","));        
    }

    // Download CSV file
    downloadCSV(csv.join("\n"), filename);
}


var computeAllFlag = true;
jQuery(document).ready(function() {
    docx4js = require("docx4js");
    
    jQuery('body').on( 'dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });
    jQuery('body').on( 'dragenter', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });
    
    jQuery("body").on("drop", function(e) {
        console.log("here");
        e.preventDefault();
        handleDrop(e);
    });
    
    jQuery('#out').on('click', ".plate", function() {
        plotOnePlate(jQuery(this).attr("plate-nr"));
        jQuery('.plate').removeClass('marked');
        jQuery(this).addClass('marked');
    });  

    jQuery('#download-table').on('click', function() {
        exportTableToCSV('data.csv');
    });
});