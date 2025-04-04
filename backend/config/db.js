const {Pool}=require('pg');
require('dotenv').config()

const pool=new Pool({
    user:'postgres',
    host:'localhost',
    database:'smart_parking_management',
    password:'1234',
    port: 5432 ,
    
});

pool.connect()
  .then(()=> console.log("postgress connected succesefully"))
  .catch(err=> console.log("database conncetion errro",err.stack));


  module.exports=pool;

