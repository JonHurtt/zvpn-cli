require('should');
var yargs = require('yargs');

var dateFormat = require('dateformat');
var now = new Date();
var pjson = require('./package.json');
var fs = require('file-system');
var csv = require('csv');
var constants = require('./constants.json');
var zen_regions = require('./zen_regions.json');
var client_domain = constants.client_domain;
	

var newline = "\n";
var debug_spacer = "+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++";
var spacer = "\n#"+debug_spacer+"\n";


/*******************************************************/
//YARGS
/*******************************************************/
var argv=yargs.command('bulk', 'Bulk Import of CSV File {loc,phase,hostname,client_name,pass,zen}', function (yargs) {
		return yargs.options({ 
			path: {
				demand: true,
				alias: 'p',
				description: 'path for CSV {loc,phase,hostname,client_name,pass,zen}',
				type: 'string'
			},failover: {
				demand: true,
				alias: 'f',
				description: 'use to enable failover configuration',
				type: 'boolean'
			},phase: {
				default: 'ALL',
				demand: false,
				alias: 'x',
				description: 'current phase of output',
				type: 'string'				
			},output: {
				default: 'NONE',
				demand: false,
				alias: 'o',
				description: 'desired output directory',
				type: 'string'				
			}
	})//end yarg.options
		.help('help')
	})//end command
	.help('help')//argument set --help 
	.argv;//example of chaning functions
	
var command = argv._[0]; //underscore named argument
var csv_filepath = argv.path;
var gateawy_failover = argv.failover; 

if(argv.phase != 'ALL'){
	var current_phase = argv.phase;
}else{
	var current_phase = "ALL";
}

if(argv.output != 'NONE'){
	var output_directory = argv.output;

}else{
	var output_directory = 'output/';
}


var locations = [];
//var output_directory = 'output/';
var cli_directory = output_directory;
var csv_directory = output_directory;
var debug_directory = output_directory;
var debug = '';
var locations_created = 0;


/*******************************************************/
//Utilty functinons
/*******************************************************/
function isEmpty(str) {
  return typeof str == 'string' && !str.trim() || typeof str == 'undefined' || str === null;
}

/*******************************************************/
//Create Directories needed to write files.
/*******************************************************/

function create_directories(input_filepath){
	return new Promise(function (resolve, reject){		
		log_debug(debug_spacer);
		log_debug('start create_directories');
		
		log_debug("Input Filepath: " + input_filepath);
		var input_file = input_filepath.replace(/\..+$/, '');
		log_debug('File Ext Removed: ' + input_file);
		var input_filename = input_file.split('/');
		log_debug('Splitting: ' + input_filename);
		log_debug('Filename: ' + input_filename[input_filename.length -1 ]);
		
		if(current_phase == 'ALL'){
			//cli_directory += dateFormat(now, "yyyy-mm-dd")+"/"+input_filename[input_filename.length -1 ]+"/";
			cli_directory += input_filename[input_filename.length -1 ]+"/"+ "All" +"/"+dateFormat(now, "yyyy-mm-dd")+"/";
		}else{
			//cli_directory += dateFormat(now, "yyyy-mm-dd")+"/"+input_filename[input_filename.length -1 ]+"/";
			cli_directory += input_filename[input_filename.length -1 ]+"/"+ current_phase + "/"+dateFormat(now, "yyyy-mm-dd")+"/";
		}
		csv_directory = cli_directory+"csv/";
		debug_directory = cli_directory;
		
		log_debug("cli_directory: " + cli_directory);
		log_debug("csv_directory: " + csv_directory);
		log_debug("debug_directory: " + debug_directory);	
		
		fs.mkdir(cli_directory, function(err) {});
		fs.mkdir(csv_directory, function(err) {});
		
		console.log("Directories have been created...")
		console.log(spacer);

		log_debug('end create_directories');
		log_debug(debug_spacer);
		
		resolve();
		});
}//end create_directories

/*******************************************************/
//Write a String to File
/*******************************************************/
function write_to_file(output, filepath){
	return new Promise(function (resolve, reject){		
		log_debug("++Generating "+filepath);
		
		fs.writeFile(filepath, output, function(err) {
		    if(err) {return console.log(err);}
			//console.log("+Successful Generation of "+filepath+"!");
			resolve();
		})
	});//end promise function
}//end write_to_file()



/*******************************************************/
//Adding a single locaiton to the array locations
/*******************************************************/
function add_location(data){
	
	/*
		CSV #
		0:name
		1:phase
		2:hostname
		3:client_name
		4:password
		5:zen_region
		6:state
		7:timezone
	*/
	
	var location = {
		name: data[0],
		phase: data[1],
		hostname: data[2],
		client_name: data[3],
		password: data[4],
		zen_code: data[5],
		gateway: '',
		f_gateway: '',
		state: data[6],
		timeZone: data[7]
	};//defining an empty object
	
	log_debug("===add_location(data)===");
	log_debug(data.toString());
	
	//Define ZEN Node
	gateways = determine_zen(location.zen_code);
	
	location.gateway = gateways.primary;
	location.f_gateway = gateways.failover;	
			
	locations.push(location);
}//end add_location
	
/*******************************************************/
//Utilty take parsed data and create locations
/*******************************************************/
function add_locations(data){
	return new Promise(function (resolve, reject){		

		log_debug(debug_spacer);		
		log_debug('===add_locations(locations)===');
		log_debug('===Current '+ current_phase +'===');		
		log_debug(debug_spacer);		
		
		data.forEach(function (location){			
			if(location[1] == current_phase || current_phase == 'ALL'){
				log_debug(debug_spacer);
				log_debug('***Adding Location ' + location[0] + '***');
				log_debug('***Location Phase ' + location[1] + '***');
				log_debug(debug_spacer);

				add_location(location)					
			}else{
				log_debug(debug_spacer);
				log_debug('***Bypassing Location ' + location[0] + '***');
				log_debug('***Location Phase "' + location[1] + '"***');
				
				log_debug(debug_spacer);
			}
		})//endforeach
		resolve();	
	})//end promise
}//end of locations


/*******************************************************/
//Determine the Gateways based on ZEN Code
/*******************************************************/
function determine_zen(zen_code){
	log_debug('===determine_zen(zen_code)===');
	log_debug('zen_code: '+zen_code);

	var gateways = {"primary": "", "failover":""};

	failover_zen = zen_regions[zen_code].failover;
	
	gateways.primary = zen_regions[zen_code].zen_ip
	gateways.failover = zen_regions[failover_zen].zen_ip;
	
	log_debug('Zen IP: ' + zen_regions[zen_code].zen_ip);
	log_debug('Failover zen_code: '+failover_zen);
	log_debug('Failover Zen IP: ' + zen_regions[failover_zen].zen_ip);
		
	return gateways;
}


/*******************************************************/
//Generate the CLI Commands based on Location
/*******************************************************/
function get_commands(location){
	log_debug('get_commands(location)');
	log_debug("{c_n" + location.client_name + ", p: " + location.password + ", g: " + location.gateway + ", f_g: "+location.f_gateway+"}");
	
	var cli;
	
	cli = spacer;	
	cli += "#Start of Configuration for "+ location.name ;
	cli += newline;
	cli += "#S-CLI Filename: VPN-ZEN-"+ location.client_name + "-v2" ;
	cli += newline;
	cli += "#S-CLI-Desc: "+ location.phase + ": " + location.hostname ;
	cli += spacer;
	cli += "usbmodem auto-reboot enable wait-time 1";	
	cli += newline; 
	cli += "user-profile Public-VPN-User security deny ipv6";
	cli += newline;
	cli += "vpn l2l-access-list VPN-ACL src-ip 192.168.47.0/24 dst-ip 0.0.0.0/0";
	cli += newline;
	cli += "vpn l2l-access-list VPN-ACL src-ip 10.0.0.0/16 dst-ip 0.0.0.0/0";
	cli += newline;	
	cli += get_vpn_commands(location.gateway, location.client_name, location.password, false);
	cli += newline;	
	
	if(!isEmpty(location.f_gateway) && gateawy_failover){
		log_debug('Location is configured with Failover Gateway');
		cli += get_vpn_commands(location.f_gateway, location.client_name, location.password, true);	
	}
	
	cli += spacer;
	cli += "#End of Configuration for "+ location.name ;
	cli += spacer;
	
	log_debug(debug_spacer)

	return cli;
	
}//end get_commands()


/*******************************************************/
//Generate VPN/Gateway specfic caommands
/*******************************************************/
function get_vpn_commands(gateway, client_name, password, failover){
	var cli_vpn;
	var vpn ='';
	
	if(failover === true ){VPN = "VPN-Failover"}else{var VPN = "VPN-Primary"}
	
	log_debug("starting get_vpn_commands("+gateway+", "+client_name+", "+password+", "+failover+")");
	cli_vpn = newline;	
	cli_vpn += "vpn client-ipsec-tunnel "+VPN+" vpn-mode layer-3 lan-to-lan-vpn";
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
}//end get_vpn_commands()


/*******************************************************/
//Generate the File for CLI Commands
/*******************************************************/
function generate_file(location){
	return new Promise(function (resolve, reject){		
		var output = "";
		var filename = dateFormat(now, "yyyymmdd")+"-scli-"+location.client_name + ".txt"
		var filepath = cli_directory + filename;
		
		log_debug(debug_spacer); 
	
		log_debug("Generating CLI for location "+location.name+"...");
		console.log("Generating CLI for location "+location.name+"...")
		locations_created++;
		
		output = spacer;	
		output += "#Generated by " +	pjson.name + " v"+pjson.version;
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
		output +=get_commands(location);
		resolve({output: output, filepath: filepath});	
		}//end function
	);//end return
}//end generate_file()


/*******************************************************/
//Bulk Generate - If you can refactor this to resolve after writing rather than after loop
/*******************************************************/
function bulk_generate_file(locations){
	return new Promise(function(resolve,reject){
		log_debug(debug_spacer);
		log_debug('+Bulk Generation has begun...');
		log_debug(debug_spacer);
		
		console.log("Bulk Generation has begun...")
		console.log(spacer);

		
		
		locations.forEach(function (location){
			generate_file(location)
				.then(function(data){			
					write_to_file(data.output, data.filepath)
						.then(function(){
							//This is when the file is complete
						});//end thenfunction
				})//end thenfucntion
		})//end forEach function

		console.log(spacer);
		
		console.log("Bulk Generation is complete...")
		console.log(spacer);

		
		log_debug(debug_spacer);	
		log_debug('+Bulk Generation is complete...');
		log_debug(debug_spacer);
		resolve();
	});//end return
}//end bulk_generate_file



/*******************************************************/
//Stream: Parse and Process the CSV File and generate csv and cli files
/*******************************************************/
function process_stream_csv(csv_file){
	console.log("Processing... " + csv_file + "");
	console.log(spacer);
		/*CSV Format: location,client_name,password,zen_code*/	
		var parser = csv.parse({delimiter: ',', comment: '#', trim: 'true'}, function(err, csv_data){
			log_debug('===csv input===');
			log_debug(JSON.stringify(csv_data))
			log_debug('===add_locations(data)===');
			add_locations(csv_data)
			.then(function(){
				log_debug(debug_spacer);												
				log_debug('===then.create_directories()===');
				log_debug(debug_spacer);												
				create_directories(csv_filepath).then(function(){	
					log_debug(debug_spacer);								
					log_debug('===then.bulk_generate_file(locations)===');
					log_debug(debug_spacer);								
					bulk_generate_file(locations).then(function(){
						log_debug(debug_spacer);
						log_debug('===then.generate_location_csv(locations)===');
						log_debug(debug_spacer);
						generate_location_csv(locations).then(function(){
							log_debug(debug_spacer);							
							log_debug('===then.generate_vpn_cred_csv(locations)===');
							log_debug(debug_spacer);	
							generate_vpn_cred_csv(locations).then(function(){
								log_debug(debug_spacer);							
								log_debug('===then.generate_remove_vpn_location_csv(locations)===');
								log_debug(debug_spacer);	
								generate_remove_vpn_location_csv(locations).then(function(){
									log_debug(debug_spacer);							
									log_debug('===then.generate_remove_vpn_location_csv(locations)===');
									log_debug(debug_spacer);	
									generate_remove_vpn_cred_csv(locations).then(function(){
									generate_debug().then(function(){
										console.log("end of application");
										console.log(spacer);
									});	
									})//end generate_remove_vpn_cred_csv.then
								})//end generate_remove_vpn_location_csv.then
							})//end generate_vpn_cred_csv.then
						})//end generate_location_csv.then
					})//end then generate_debug
				})//end then create_directories
			})//end then add_locations	
		});//end parser object
		
		
		log_debug('===begining of createReadStream(csv_file)===');
		var rs = fs.createReadStream(csv_file);
		
		rs.on('error', function(error){
			console.log('Error:', error.message)
			console.log(spacer);
		});

		rs.pipe(parser)

}//end process_stream_csv


/*******************************************************/
//Generate  Location CSV File
/*******************************************************/
function generate_location_csv(locations){
	return new Promise(function(resolve,reject){
		log_debug('+Location CSV generation has begun...');
		//function to generate locations csv
		var output = '';
		var location_csv_filename = dateFormat(now, "yyyymmdd")+"-02-add-location.csv";
		var location_csv_filepath = csv_directory + location_csv_filename;

		//+,Location,Test-Location,,CA,United States, America/New York,,,,,,,,,,FQDN,sf-castro@bankofamerica.com		
		locations.forEach(function (location){
			output += "+,Location,"+location.name+",,"+location.state+",United States, "+location.timeZone+",,,,,,,,,,FQDN,"+location.client_name+"@"+client_domain+"\n"
		})
	
		write_to_file(output,location_csv_filepath);
				
		console.log("Generation of Zscaler VPN locations CSV is complete...")
		console.log(spacer);

		
		resolve();
	});
}//end generate__location_csv


/*******************************************************/
//Generate VPN Location CSV File for Removal
/*******************************************************/
function generate_remove_vpn_location_csv(locations){
	return new Promise(function(resolve,reject){
		log_debug('+Removing Location CSV generation has begun...');
		//function to generate locations csv
		var output = '';
		var location_csv_filename = dateFormat(now, "yyyymmdd")+"-minus-location.csv";
		var location_csv_filepath = csv_directory + location_csv_filename;
		

		//+,Location,Test-Location,,CA,United States, America/New York,,,,,,,,,,FQDN,sf-castro@bankofamerica.com		
		locations.forEach(function (location){
			output += "-,Location,"+location.name+"\n"
		})
	
		write_to_file(output,location_csv_filepath);
		resolve();
	});
}//end generate_remove_vpn_location_csv


/*******************************************************/
//Generate VPN Credentials CSV File
/*******************************************************/
function generate_vpn_cred_csv(locations){
	return new Promise(function(resolve,reject){

		log_debug('+Location VPN Credentials generation has begun...');


		/*
		Action,PSK Type,VPN User Name,Comments,Pre-Shared Key,THIS IS A HEADER LINE WHICH WILL NOT BE IMPORTED - YOUR DATA MUST START FROM LINE 2
		+,UFQDN,{client_name}@domain.com,Location:{Location}[{Password}],{Password},
		*/
		
		//function to generate locations csv
		var output = 'Action,PSK Type,VPN User Name,Comments,Pre-Shared Key,THIS IS A HEADER LINE WHICH WILL NOT BE IMPORTED - YOUR DATA MUST START FROM LINE 2\n';
		var vpn_csv_filename = dateFormat(now, "yyyymmdd")+"-01-add-vpn-credentials.csv";
		var location_csv_filepath = csv_directory + vpn_csv_filename;
		
		//+,VPN,{Location},FQDN,{client_name}@domain.com
		locations.forEach(function (location){
			output += "+,UFQDN,"+location.client_name+"@"+client_domain+","+location.phase+":"+location.client_name+"["+location.password+"],"+location.password+",\n";
		})
		
		write_to_file(output,location_csv_filepath);
		log_debug(debug_spacer);					
		
		console.log("Generation of Zscaler VPN Credentials CSV is complete...")
		console.log(spacer);		

		resolve();
	});
}//end generate_vpn_cred_csv

/*******************************************************/
//Generate Removeal VPN Credentials CSV File
/*******************************************************/
function generate_remove_vpn_cred_csv(locations){
	return new Promise(function(resolve,reject){

		log_debug('+Removal Location VPN Credentials generation has begun...');
		/*
		Action,PSK Type,VPN User Name,Comments,Pre-Shared Key,THIS IS A HEADER LINE WHICH WILL NOT BE IMPORTED - YOUR DATA MUST START FROM LINE 2
		+,UFQDN,{client_name}@domain.com,Location:{Location}[{Password}],{Password},
		*/
		
		//function to generate locations csv
		var output = 'Action,PSK Type,VPN User Name,Comments,Pre-Shared Key,THIS IS A HEADER LINE WHICH WILL NOT BE IMPORTED - YOUR DATA MUST START FROM LINE 2\n';
		var vpn_csv_filename = dateFormat(now, "yyyymmdd")+"-minus-vpn-credentials.csv";
		var location_csv_filepath = csv_directory + vpn_csv_filename;
		
		//+,VPN,{Location},FQDN,{client_name}@domain.com
		locations.forEach(function (location){
			output += "-,UFQDN,"+location.client_name+"@"+client_domain+",P:"+location.phase+"Loc:"+location.client_name+"["+location.password+"],"+location.password+",\n";
		})
		
		write_to_file(output,location_csv_filepath);
		log_debug(debug_spacer);							

		resolve();
	});
}//end generate_vpn_cred_csv


/*******************************************************/
//Generate Summary 
/*******************************************************/
function log_debug(input){
	//console.log(input);
	debug += "[" + dateFormat(now, "yyyymmdd:HH:MM:ss") + "]:" + input + "\n";
}


/*******************************************************/
//Generate Summary 
/*******************************************************/
function generate_debug(){	
	return new Promise(function(resolve,reject){
		var debug_filename = "_debug-summary-"+dateFormat(now, "yyyymmddHHMMss")+".txt";
		var debug_filepath = debug_directory + debug_filename;
		
		console.log("Locations Created: " + locations_created)
		console.log(spacer);
	
		log_debug("++Generating "+debug_filepath+" ........");
		log_debug(debug_spacer);
		log_debug("Additional Output will be displayed in the console");
		log_debug(debug_spacer);
		log_debug("end")
		write_to_file(debug,debug_filepath);
		resolve();
	});//end Promise
	
	
	
}//end generate_debug


/*******************************************************/
//	Start of Application
/*******************************************************/

console.log(spacer);
console.log(pjson.name + "- v"+pjson.version);
console.log(pjson.homepage);
console.log(spacer);

log_debug(debug_spacer);
log_debug(pjson.name + "- v"+pjson.version);
log_debug(debug_spacer);
log_debug(pjson.homepage);
log_debug(debug_spacer);
log_debug(JSON.stringify(argv));
log_debug(debug_spacer);

if(command === 'bulk'){
	console.log("Starting Bulk process...");
	console.log(spacer);
	console.log("FileName: "+csv_filepath);
	console.log("Output Location: "+output_directory);
	
	if(isEmpty(csv_filepath)){
	
		console.log("Error: Please Provide a filename...");
		console.log(spacer);
		
	}else{
		if(gateawy_failover){
			console.log("Configure S-CLI with dual VPN Gateways");
		}else{
			console.log("Configuring S-CLI with single VPN Gateways ");
		};
		
		console.log("Processing locations for "+ current_phase);
		console.log(spacer);	
	
		process_stream_csv(csv_filepath);
		
	}
		
	/*.then(function() {
		console.log(spacer);
		console.log("Application complete, please visit " + cli_directory + " for the files...");
		console.log(spacer);
		generate_debug();

	});*/
	
}else{
	console.log("Menu System coming soon...");
	console.log(spacer);
	console.log("Please use following format.\n");
	console.log("For Single VPN: \n node ~/scli-vpn/app.js bulk -p <INPUT_FILE> -o <OUTPUT_DIR> -x <PHASE>");
	console.log("For Redundant VPN :\n node ~/scli-vpn/app.js bulk -f -p ~/BofA/_HiveOS-SCLI-Master.csv -o ~/BofA/S-CLI-Output/ -x 'PHASE 1'");
	console.log(spacer);
	yargs.showHelp();
	console.log(spacer);
	console.log('end');
	console.log(spacer);

/*
1 - Select Single or Bulk
--Single 
--ask for 
--Bulk - Ask for File
---Parse File and output
*/

}
