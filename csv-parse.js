var parse = require('csv-parse');
//require('should');

var input = '#Welcome\n"1","2","3","4"\n"a","b","c","d"';
parse(input, {comment: '#'}, function(err, output){
	console.log("output");
	console.log(output)
  //output.should.eql([ [ '1', '2', '3', '4' ], [ 'a', 'b', 'c', 'd' ] ]);
});