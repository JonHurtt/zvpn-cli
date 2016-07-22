var fs = require('fs');
var csv = require('csv');
var locations;

var parser = csv.parse({delimiter: ','}, function(err, data){
  //console.log(data);
  locations = data;
  
  
console.log(locations)
});

fs.createReadStream('csv_output/test.csv').pipe(parser);




