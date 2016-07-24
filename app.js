var dateFormat = require('dateformat');
var now = new Date();
var pjson = require('./package.json');
//var fs = require('fs');
var fs = require('file-system');
var csv = require('csv');
var constants = require('./constants.json');
var zen_regions = require('./zen_regions.json');
var client_domain = constants.client_domain;	
var newline = "\n";
var spacer = "\n#++++++++++++++++++++++++++++++++++++++++++++++++++++++++\n";
var locations = [];
var cli_directory = 'output/';
var csv_directory = 'output/';


var argv = require('yargs')
	.command('build', 'CSV File for import', function (yargs) {
		return yargs.options({ //Returning Options as third paramter of .command(cmd, desc, [module])
			path: {
				demand: true,
				alias: 'p',
				description: 'path for CSV',
				type: 'string'
			}
		}//end of options function
		)//end of options
		.help('help')
	})//end command
	.help('help')//argument set --help 
	.argv;//example of chaning functions
	
//Example of above code simplified to single line
//var argv = require('yargs').command('hello', 'Greets the user', function (yargs) {...}).help('help').argv;//example of chaning functions
		
var command = argv._[0]; //underscore named argument
var csv_filepath = argv.path; // --firstName named argument



function isEmpty(str) {
  return typeof str == 'string' && !str.trim() || typeof str == 'undefined' || str === null;
}


function add_location(data){
	var location = {
		name: data[0],
		client_name: data[1],
		password: data[2],
		zen_code: data[3],
		gateway: '',
		f_gateway: ''
	};//defining an empty object
	
	//console.log(data);
	//console.log(location);
	//Define ZEN Node
	gateways = determine_zen(location.zen_code);
	
	location.gateway = gateways.primary;
	location.f_gateway = gateways.failover;	
	
		
	locations.push(location);		
	//console.log(locations);
}//end add_location
	
	
function add_locations(locations){
		locations.forEach(function (location){

		console.log('Adding Location ' + location[0] + ' ');
		add_location(location)
	})
	
	/*
		console.log(spacer);	
		console.log('Locations Added');
		console.log(locations);	
		console.log(spacer);		
	*/
}//end add_locations




function determine_zen(zen_code){
	var gateways = {"primary": "", "failover":""};

	console.log("Zen Code:"+zen_code);
	console.log(zen_regions[zen_code].zen_ip);
	

	failover_zen = zen_regions[zen_code].failover;
	console.log("Failover Zen Code:"+failover_zen);
	console.log(zen_regions[failover_zen].zen_ip);
	
	gateways.primary = zen_regions[zen_code].zen_ip
	gateways.failover = zen_regions[failover_zen].zen_ip;
	
	return gateways;
}


function getCLI(location){
	var cli;
	//console.log("starting getCLI");
	//console.log("Variables {client_name: " + location.client_name + ", password: " + location.password + ", gateway: " + location.gateway + ", f_gateway: "+location.f_gateway+"}");
	
	cli = spacer;	
	cli += "#Start of Configuration for "+ location.name ;
	cli += spacer;
	cli += "user-profile Public-VPN-User security deny ipv6";
	cli += newline;
	cli += "vpn l2l-access-list VPN-ACL src-ip 192.168.47.0/24 dst-ip 0.0.0.0/0";
	cli += newline;
	cli += "vpn l2l-access-list VPN-ACL src-ip 10.0.0.0/16 dst-ip 0.0.0.0/0";
	cli += newline;	
	cli += getVPN(location.gateway, location.client_name, location.password, false);
	cli += newline;	
	
	if(!isEmpty(location.f_gateway)){
		//console.log('Location is configured with Failover Gateway');
		cli += getVPN(location.f_gateway, location.client_name, location.password, true);	
	}else{		
		//console.log('Location is NOT configured with Failover Gateway');
	}
	cli += spacer;
	cli += "#End of Configuration for "+ location.name ;
	cli += spacer;
	
	return cli;
	
}//end getCLI()
function getVPN(gateway, client_name, password, failover){
	var cli_vpn;
	
	if(failover === true ){
		var VPN = "VPN-2"
	}else{
		var VPN = "VPN-1"
	}
	
	//console.log("starting getVPN("+gateway+", "+client_name+", "+password+", "+failover+")");
	cli_vpn = "vpn client-ipsec-tunnel "+VPN+" vpn-mode layer-3 lan-to-lan-vpn";
	cli_vpn += newline;	
	cli_vpn += "vpn ipsec-tunnel "+VPN+" gateway "+gateway+" client-name "+client_name+"@"+client_domain+" password "+password+"";
	cli_vpn += newline;
	cli_vpn += "vpn ipsec-tunnel "+VPN+" ike phase1 auth-method psk";
	cli_vpn += newline;
	cli_vpn += "vpn ipsec-tunnel "+VPN+" ike phase1 psk "+password+" ";
	cli_vpn += newline;
	cli_vpn += "vpn ipsec-tunnel "+VPN+" dpd idle-interval 5 retry 5 retry-interval 5";
	cli_vpn += newline;
	cli_vpn += "vpn ipsec-tunnel "+VPN+" ike phase1 encryption-algorithm aes128";
	cli_vpn += newline;
	cli_vpn += "vpn ipsec-tunnel "+VPN+" ike phase1 lifetime 86400";
	cli_vpn += newline;
	cli_vpn += "vpn ipsec-tunnel "+VPN+" ike phase2 encryption-algorithm aes128";
	cli_vpn += newline;
	cli_vpn += "vpn ipsec-tunnel "+VPN+" ike phase2 hash md5";
	cli_vpn += newline;
	cli_vpn += "vpn ipsec-tunnel "+VPN+" ike phase2 lifetime 28800";
	cli_vpn += newline;
	cli_vpn += "vpn ipsec-tunnel "+VPN+" ike phase1 mode aggressive";
	cli_vpn += newline;
	cli_vpn += "vpn ipsec-tunnel "+VPN+" local-ike-id ufqdn "+client_name+"@"+client_domain;
	cli_vpn += newline;
	cli_vpn += "vpn ipsec-tunnel "+VPN+" l2l-access-list VPN-ACL";
	cli_vpn += newline;

	if(failover === true ){
		cli_vpn += "vpn tunnel-policy ZVPN client ipsec-tunnel "+VPN+ " ";
	}else{
		cli_vpn += "vpn tunnel-policy ZVPN client ipsec-tunnel "+VPN+" primary";
	}
	return cli_vpn;
}//end getVPN()

function generate_file(location){
	return new Promise(function (resolve, reject){		
		var output = "";
		var filename = dateFormat(now, "yyyymmdd")+"-scli-"+location.client_name + ".txt"
		var filepath = cli_directory + filename;
		
		//console.log(spacer);
		//console.log("Generating CLI...");
		output = spacer;	
		output += "#Generated by " +	pjson.name + "- v"+pjson.version;
		output += newline;
		output += "#Readme found here " +	pjson.homepage;
		output += newline;
		output += "#filename: "+filename;
		output += newline;
		output += "#filepath: "+filepath;
		output += newline;
		output += "#created: "+ dateFormat(now, "dddd, mmmm dS, yyyy, h:MM:ss TT");
		output += newline;
		output += "#debug: "+location.name+"|"+location.client_name+"|"+location.password;
		output += newline;
		output += "#debug: "+location.zen_code+"|"+location.gateway+"|"+location.f_gateway;		
		output += spacer;
		output +=getCLI(location);
		resolve({output: output, filepath: filepath});	
		}//end function
	);//end return
}//end generate_file()

function write_to_file(output, filepath){
	console.log("++Generating "+filepath+" ........");

	
	fs.writeFile(filepath, output, function(err) {
	    if(err) {
	        return console.log(err);
	    }
	    console.log("+++Succesful Generation of "+filepath+"!");
	});	
}//end write_to_file()

function bulk_generate(locations){
	console.log('+Bulk Generation has begun...');
	locations.forEach(function (location){generate_file(location).then(function(data){write_to_file(data.output, data.filepath);})})
}//end bulk_generate

function parse_csv(csv_file){
	/*CSV Format: name,client_name,gateway,fgateway*/	
	var parser = csv.parse({delimiter: ',', comment: '#'}, function(err, data){
		console.log("Parsed Data");
		console.log(data);
		add_locations(data);
		create_directories();
		bulk_generate(locations);
		generate_location_csv(locations);
		generate_vpn_cred_csv(locations);

	});
		
	fs.createReadStream(csv_file).pipe(parser);
}//end parse_csv

function create_directories(){
	/*FIX THE CREATE DIRECTORIES*/		
		cli_directory += dateFormat(now, "yyyy-mm-dd")+"/";
		csv_directory = cli_directory+"csv/";
		
		fs.mkdir(cli_directory, function(err) {});
		fs.mkdir(csv_directory, function(err) {});
	
}

function generate_location_csv(locations){
	console.log('+Location CSV generation has begun...');
	//function to generate locations csv
	var output = '';
	var location_csv_filename = dateFormat(now, "yyyymmdd")+"-vpn-location.csv";
	var location_csv_filepath = csv_directory + location_csv_filename;
	
	//+,VPN,{Location},FQDN,{client_name}@domain.com
	locations.forEach(function (location){
		output += "+,VPN,"+location.name+",FQDN,"+location.client_name+"@"+client_domain+"\n";
	})
	
	console.log("++Generating "+location_csv_filepath+" ........");
	
	fs.writeFile(location_csv_filepath, output, function(err) {
	    if(err) {
	        return console.log(err);
	    }
	    console.log("+++Succesful Generation of "+location_csv_filepath+"!");
	});	

}

function generate_vpn_cred_csv(locations){
	console.log('+Location VPN Credentials generation has begun...');
	/*
	Action,PSK Type,VPN User Name,Comments,Pre-Shared Key,THIS IS A HEADER LINE WHICH WILL NOT BE IMPORTED - YOUR DATA MUST START FROM LINE 2
	+,UFQDN,{client_name}@domain.com,Location:{Location}[{Password}],{Password},
	*/
	
	//console.log(locations);
	//function to generate locations csv
	var output = 'Action,PSK Type,VPN User Name,Comments,Pre-Shared Key,THIS IS A HEADER LINE WHICH WILL NOT BE IMPORTED - YOUR DATA MUST START FROM LINE 2\n';
	var vpn_csv_filename = dateFormat(now, "yyyymmdd")+"-vpn-credentials.csv";
	var location_csv_filepath = csv_directory + vpn_csv_filename;
	
	//+,VPN,{Location},FQDN,{client_name}@domain.com
	locations.forEach(function (location){
		output += "+,UFQDN,"+location.name+"@"+client_domain+",Location:"+location.client_name+"["+location.password+"],"+location.password+",\n";
	})
	
	console.log("++Generating "+location_csv_filepath+" ........");
	
	fs.writeFile(location_csv_filepath, output, function(err) {
	    if(err) {
	        return console.log(err);
	    }
	    console.log("+++Succesful Generation of "+location_csv_filepath+"!");
	});	

}
	

//console.log(getCLI("[GATEWAY]", "[CLIENT_NAME]", "[PASSWORD]","[FAILOVER_GATEWAY]" ));
//console.log(getCLI("[GATEWAY]", "[CLIENT_NAME]", "[PASSWORD]" ));
//generate_file("[GATEWAY]", "zvpn-br-scli", "[PASSWORD]","[FAILOVER_GATEWAY]" )
//generate_file(locations[0])
/*for (i=0; i < 5; ++i){
	console.log('Add Location' + i + ' to locations');
	add_location('location'+i, 'password'+i, 'gateway'+i, 'f_gateway'+i)
}*/


/*********************************************
	Start of Application
**********************************************/

console.log(spacer);
console.log(pjson.name + "- v"+pjson.version);
console.log(pjson.homepage);
console.log(spacer);

if(command === 'build'){
	parse_csv(csv_filepath);
}else{
	//console.log(zen_regions);
	//determine_zen('ATL');

}
console.log(spacer);



