require('should');
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

var locations = [];
var output_directory = 'output/';
var cli_directory = output_directory;
var csv_directory = output_directory;
var debug_directory = output_directory;
var debug = '';

/*******************************************************/
//YARGS
/*******************************************************/
var argv = require('yargs')
	.command('bulk', 'CSV File for import', function (yargs) {
		return yargs.options({ //Returning Options as third paramter of .command(cmd, desc, [module])
			path: {
				demand: true,
				alias: 'p',
				description: 'path for CSV {loc,client_name,pass,zen}',
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


/*******************************************************/
//Utilty functinons
/*******************************************************/
function isEmpty(str) {
  return typeof str == 'string' && !str.trim() || typeof str == 'undefined' || str === null;
}

/*******************************************************/
//Create Directories needed to write files.
/*******************************************************/

function create_directories(){
	return new Promise(function (resolve, reject){		
		log_debug(debug_spacer);
		log_debug('start create_directories');
		
	
		cli_directory += dateFormat(now, "yyyy-mm-dd")+"/";
		csv_directory = cli_directory+"csv/";
		debug_directory = cli_directory;
		
		log_debug("cli_directory: " + cli_directory);
		log_debug("csv_directory: " + csv_directory);
		log_debug("debug_directory: " + debug_directory);	
		
		fs.mkdir(cli_directory, function(err) {});
		fs.mkdir(csv_directory, function(err) {});
		
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
			console.log("+++Successful Generation of "+filepath+"!");
			resolve();
		})
	});//end promise function
}//end write_to_file()



/*******************************************************/
//Adding a single locaiton to the array locations
/*******************************************************/
function add_location(data){
	
	var location = {
		name: data[0],
		client_name: data[1],
		password: data[2],
		zen_code: data[3],
		gateway: '',
		f_gateway: ''
	};//defining an empty object
	
	log_debug("===add_location(data)===");
	log_debug('data.toString()');
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

		log_debug('===add_locations(locations)===');
	
		data.forEach(function (location){
			log_debug(debug_spacer);
			log_debug('***Adding Location ' + location[0] + '***');
			log_debug(debug_spacer);
			
			add_location(location)
			
		})
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
	cli += spacer;
	cli += "user-profile Public-VPN-User security deny ipv6";
	cli += newline;
	cli += "vpn l2l-access-list VPN-ACL src-ip 192.168.47.0/24 dst-ip 0.0.0.0/0";
	cli += newline;
	cli += "vpn l2l-access-list VPN-ACL src-ip 10.0.0.0/16 dst-ip 0.0.0.0/0";
	cli += newline;	
	cli += get_vpn_commands(location.gateway, location.client_name, location.password, false);
	cli += newline;	
	
	if(!isEmpty(location.f_gateway)){
		log_debug('Location is configured with Failover Gateway');
		cli += get_vpn_commands(location.f_gateway, location.client_name, location.password, true);	
	}else{		
		//console.log('Location is NOT configured with Failover Gateway');
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
	
	if(failover === true ){VPN = "VPN-2"}else{var VPN = "VPN-1"}
	
	log_debug("starting get_vpn_commands("+gateway+", "+client_name+", "+password+", "+failover+")");
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
//Bulk Generate
/*******************************************************/
function bulk_generate_file(locations){
	return new Promise(function(resolve,reject){
		log_debug(debug_spacer);
		log_debug('+Bulk Generation has begun...');
		log_debug(debug_spacer);
		
		locations.forEach(function (location){
			generate_file(location)
				.then(function(data){			
					write_to_file(data.output, data.filepath)
						.then(function(){
							//This is when the file is complete
						});//end thenfunction
				})//end thenfucntion
		})//end forEach function
		
		log_debug(debug_spacer);	
		log_debug('+Bulk Generation has concluded...');
		log_debug(debug_spacer);
		resolve();
	});//end return
}//end bulk_generate_file



/*******************************************************/
//Parse and Process the CSV File and generate csv and cli files
/*******************************************************/
function process_csv(csv_file){
	return new Promise(function(resolve,reject){
		/*CSV Format: location,client_name,password,zen_code*/	
		var parser = csv.parse({delimiter: ',', comment: '#', trim: 'true'}, function(err, csv_data){
		/*	
			log_debug('===csv input===');
			log_debug(csv_data.toString())
			log_debug('===add_locations(data)===');
			add_locations(csv_data).then(function(){
				log_debug(debug_spacer);												
				log_debug('===create_directories()===');
				log_debug(debug_spacer);												
				create_directories()
				.then(function(){	
					log_debug(debug_spacer);								
					log_debug('===bulk_generate_file(locations)===');
					log_debug(debug_spacer);								
					bulk_generate_file(locations)
					.then(function(){
						return new Promise(function(resolve, reject){
							log_debug(debug_spacer);
							log_debug('===generate_location_csv(locations)===');
							log_debug(debug_spacer);
							generate_location_csv(locations)
							.then(function(){
								return new Promise(function(resolve,reject){
									log_debug(debug_spacer);							
									log_debug('===generate_vpn_cred_csv(locations)===');
									log_debug(debug_spacer);							
									generate_vpn_cred_csv(locations);
									resolve();//resolve to finish vpn csv
								})//end function								
							});//end then generated
							resolve();//resolve to finish locations csv
						})//end Promise
					}).then(function(){			
					generate_debug();
					})//end then generate_debug
				});//end then create_directories
			})//end then add_locations	
			*/
			
			log_debug('===csv input===');
			log_debug(csv_data.toString())
			log_debug('===add_locations(data)===');
			add_locations(csv_data)
			.then(function(){
				log_debug(debug_spacer);												
				log_debug('===then.create_directories()===');
				log_debug(debug_spacer);												
				create_directories()
				.then(function(){	
					log_debug(debug_spacer);								
					log_debug('===then.bulk_generate_file(locations)===');
					log_debug(debug_spacer);								
					bulk_generate_file(locations)
					.then(function(){
							log_debug(debug_spacer);
							log_debug('===then.generate_location_csv(locations)===');
							log_debug(debug_spacer);
							generate_location_csv(locations)
							.then(function(){
									log_debug(debug_spacer);							
									log_debug('===then.generate_vpn_cred_csv(locations)===');
									log_debug(debug_spacer);							
									generate_vpn_cred_csv(locations);
							});//end then generated
					}).then(function(){			
					generate_debug();
					})//end then generate_debug
				});//end then create_directories
			})//end then add_locations	

		});//end parser object
		
		log_debug('===begining of createReadStream(csv_file)===');
		fs.createReadStream(csv_file).pipe(parser).then(function(){
			console.log('Resolving');
			log_debug('===end of createReadStream(csv_file)===');
			resolve();
		})
		
		
		///resolve();
	});//end Promise
}//end process_csv



/*******************************************************/
//Generate Location CSV File
/*******************************************************/
function generate_location_csv(locations){
	return new Promise(function(resolve,reject){
		log_debug('+Location CSV generation has begun...');
		//function to generate locations csv
		var output = '';
		var location_csv_filename = dateFormat(now, "yyyymmdd")+"-vpn-location.csv";
		var location_csv_filepath = csv_directory + location_csv_filename;
		
		//+,VPN,{Location},FQDN,{client_name}@domain.com
		locations.forEach(function (location){
			output += "+,VPN,"+location.name+",FQDN,"+location.client_name+"@"+client_domain+"\n";
		})
	
		write_to_file(output,location_csv_filepath);
		resolve();
	});
}//end generate_location_csv


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
		var vpn_csv_filename = dateFormat(now, "yyyymmdd")+"-vpn-credentials.csv";
		var location_csv_filepath = csv_directory + vpn_csv_filename;
		
		//+,VPN,{Location},FQDN,{client_name}@domain.com
		locations.forEach(function (location){
			output += "+,UFQDN,"+location.client_name+"@"+client_domain+",Location:"+location.client_name+"["+location.password+"],"+location.password+",\n";
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
	var debug_filename = "_debug-summary-"+dateFormat(now, "yyyymmdd")+".txt";
	var debug_filepath = debug_directory + debug_filename;

	//console.log("++++++++++++++++++++START OF DEBUG OUTPUT++++++++++++++++++++");
	//console.log(debug);
	//console.log("++++++++++++++++++++END OF DEBUG OUTPUT++++++++++++++++++++");

	log_debug("++Generating "+debug_filepath+" ........");
	log_debug("Final Output will be displayed in the console");
	write_to_file(debug,debug_filepath);
}//end generate_debug


/*******************************************************/
//	Start of Application
/*******************************************************/

console.log(spacer);
console.log(pjson.name + "- v"+pjson.version);
console.log(pjson.homepage);
console.log(spacer);

if(command === 'bulk'){
	process_csv(csv_filepath)
	.then(function() {
		console.log(spacer);
		console.log("Application complete, please visit " + cli_directory + " for the files...");
		console.log(spacer);
		generate_debug();

	});
}else{

/*
1 - Select Single or Bulk
--Single 
--ask for 
--Bulk - Ask for File
---Parse File and output
*/

}






