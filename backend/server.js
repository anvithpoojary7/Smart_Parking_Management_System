const express=require('express');
const dotenv=require('dotenv');
const app=express();
const path = require("path");
require("dotenv").config()
app.set("view engine","ejs");
app.set("views",path.join(__dirname,"../frontend/views"));

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"../frontend/public")));

app.get("/",(req,res)=>{
    res.render("pages/home");
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));