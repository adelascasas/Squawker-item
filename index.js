const express = require('express');
const db = require("./database.js");
const bodyParser = require("body-parser");
const cookieParser = require('cookie-parser');
const jwt = require("jsonwebtoken");
const mongoose = require('mongoose');
const app = express();


app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(cookieParser());
app.use((req,res,next) => {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers','Origin, X-Requested-With, Content-Type, Accept');
    next();
});

const Userexists = async function(req,res,next) {
    let doc =  await mongoose.model('users').findOne({username: req.body.username});
    if(doc){
        next();
    }
    else{
        res.status(500).json({status: 'error', error: 'User not added'});
    }
}

const getFollowing =  (username) =>{
    if(username){
        return  mongoose.model('users').findOne({username}).exec().then((doc) => { 
            return doc.following;
        });}
    return new Promise((resolve,reject) => {resolve(undefined)})
}

app.post("/additem",verifyToken, async(req,res) => {
    let content = req.body.content;
    if(!content){
        res.status(500).json({status: 'error', error: "no content"}); 
        return;
    }
    let childType = "";
    let media = [];
    let parent = "";
    if(req.body.childType==="retweet" && req.body.parent){
        childType = req.body.childType;
        parent = req.body.parent;
        await db.incrementretweets(parent);
    }else if(req.body.childType==="reply" && req.body.parent){
        childType = req.body.childType;
        parent = req.body.parent;}
    if(req.body.media){
        media = req.body.media;
    }
    mongoose.model('blacklist').findOne({token: req.token}).exec().then((doc) => {
        if(doc){
             res.status(500).json({status: 'error', error: "you have been logged out"}); 
        }
        else{
                jwt.verify(req.token, 'MySecretKey',(err, data)=>{
                    if(err) {
                        res.status(500).json({status:'error', error:"error verifying key"});}
                    else{
                        mongoose.model('users').findOne({username: data.user.username}).exec().then((doc) => { 
                            if(!media.every(elem => doc.media.indexOf(elem) > -1)){ res.status(500).json({status:'error', error:"media files not affiliated"}); return;}
                            mongoose.model('users').updateOne({username: data.user.username},
                                {$pullAll:{ media: media}},
                               (err, result) => {if(err){res.status(500).json({status: 'error'});}}
                            )
                            const item = {
                                username: data.user.username,
                                property: {
                                    likes: [],
                                    interest: 0
                                },
                                childType,
                                parent,
                                media,   
                                retweeted: 0,
                                content,
                                timestamp: new Date()
                            };
                            db.addDocument('squawks',item).then((resp)=>{
                                    res.status(200).json({status: 'OK',id: resp._id});
                                }, (err) => {res.status(500).json({status:'error', error:"error adding item"});});
                            });
                        }   
                    });
        }
    });
});

app.get("/item/:id",(req,res) => {
   let id = req.params.id;
    db.searchbyId("squawks",id).then((resp)=>{
        console.log(resp);
        res.status(200);
        let item = resp._source;
        if(!item.childType){
            item.childType = null;
        }
        item.property.likes = item.property.likes.length;
        delete item.property.interest;
        item.timestamp = item.timestamp = parseFloat((new Date(item.timestamp).getTime()/1000).toFixed(7));
        item.id = resp._id;
        res.json({status: 'OK',item});
    }, (err) => {
        res.status(500);
        res.json({status:'error', error:"item not found"});
    });
});

app.post("/search",setToken,(req,res) => {
    console.log(req.body);
   let input = {};
   input.rank = (req.body.rank) ? req.body.rank: "interest";
   input.replies  = (req.body.replies == undefined) ? true: req.body.replies;
   input.hasMedia = (req.body.hasMedia == undefined) ? false : req.body.hasMedia;
   input.limit = req.body.limit;
   input.parent = req.body.parent;
   input.q = req.body.q;
   input.usernames = (req.body.username) ? [req.body.username]:[];
   let following = (req.body.following == undefined) ? true: req.body.following;
   console.log(req.body.timestamp);
   input.timestamp = (!req.body.timestamp) ? new Date() : new Date(req.body.timestamp*1000);
   if(!input.limit){
       input.limit = 25;
   }
   else if(input.limit > 100){
       input.limit = 100;
   }
   mongoose.model('blacklist').findOne({token: req.token}).exec().then((doc) => {
    input.usernames = input.usernames.map((value) => {return value.toLowerCase();}); 
    if(doc){
        db.searchbyParams(input).then((resp)=>{
            let items = resp.hits.hits.map((val,index)=>{
                    let item = val._source;
                    item.id = val._id;
                    if(!item.childType){
                        item.childType = null;
                    }
                    item.property.likes = item.property.likes.length;
                    delete item.property.interest;
                    return item;
                });
                console.log(items);
                res.status(200).json({status: 'OK', items});
                }, (err) => {
                res.status(500).json({status:'error', error:"items not found"});
            });   
    }
    else{
        jwt.verify(req.token, 'MySecretKey',(err, data)=>{
                let check = (!err) ? data.user.username:undefined;
                getFollowing(check).then( result => {
                    input.usernames = (!err && following) ? input.usernames.concat(result) : input.usernames;
                    input.usernames = input.usernames.map((value) => {return value.toLowerCase();}); 
                    db.searchbyParams(input).then((resp)=>{
                        let items = resp.hits.hits.map((val,index)=>{
                                let item = val._source;
                                if(!item.childType){
                                    item.childType = null;
                                }
                                item.property.likes = item.property.likes.length;
                                delete item.property.interest;
                                item.timestamp = parseFloat((new Date(item.timestamp).getTime()/1000).toFixed(7));
                                item.id = val._id;
                                return item;
                            }); 
                            console.log(items);       
                            res.status(200).json({status: 'OK', items});
                            }, (err) => {
                            res.status(500).json({status:'error', error:"items not found"});
                    });  
                });
            });
        }
    });
});

app.delete('/item/:id',verifyToken,(req,res) => {
    mongoose.model('blacklist').findOne({token: req.token}).exec().then((doc) => {
        if(doc){
             res.status(500).json({status: 'error', error: "you have been logged out"}); 
        }
        else{
            jwt.verify(req.token, 'MySecretKey',(err, data)=>{
                if(err) {
                    res.status(500).json({status:'error', error:"error verifying key"});}
                else{
                    db.searchbyId("squawks",req.params.id).then((resp)=>{
                        let username = resp._source.username;
                        if(username === data.user.username){
                            db.deletebyId(req.params.id);
                            resp._source.media.forEach(db.delMedia);
                            res.status(200);
                            res.json({status: 'OK'});
                        }
                        else{
                            res.status(500).json({status:'error', error:"permission to delete denied"});
                        }
                    }, (err) => {
                        res.status(500).json({status:'error', error:"item not found"});
                    });                 
                }   
            });
        }
    });
});


app.post('/follow',verifyToken,Userexists,(req,res) => {
     let username = req.body.username;
     let follow = req.body.follow;
     if(follow == undefined){
         follow = true;
     }
     mongoose.model('blacklist').findOne({token: req.token}).exec().then((doc) => {
         if(doc){
              res.status(500).json({status: 'error', error: "you have been logged out"}); 
         }
         else{
             jwt.verify(req.token, 'MySecretKey',(err, data)=>{
                 if(err) {
                     res.status(500);
                     res.json({status:'error', error:"error verifying key"});}
                 else{
                       if(follow){
                         mongoose.model('users').updateOne({username: data.user.username},
                             {$addToSet:{
                                  following: username
                               }},
                            (err, result) => {if(err){console.log(err);}}
                         )
                         mongoose.model('users').updateOne({username},
                             {$addToSet:{
                                  followers: data.user.username
                               }},
                            (err, result) => {if(err){console.log(err);}}
                         )
                       }
                       else{
                         mongoose.model('users').updateOne({username: data.user.username},
                             {$pullAll:{ following: [username]}},
                             (err, result) => {if(err){console.log(err);}})
                         mongoose.model('users').updateOne({username},
                             {$pullAll:{followers: [data.user.username]}},
                            (err, result) => {if(err){console.log(err);}})
                       }
                       res.status(200);
                       res.json({status: 'OK'});          
                 }   
             });
         }
     });
});

app.post('/item/:id/like',verifyToken,(req,res) => {
    mongoose.model('blacklist').findOne({token: req.token}).exec().then((doc) => {
        if(doc){
             res.status(500).json({status: 'error', error: "you have been logged out"}); 
        }
        else{
                jwt.verify(req.token, 'MySecretKey',(err, data)=>{
                    if(err) {
                        res.status(500).json({status:'error', error:"error verifying key"});}
                    else{
                        if (typeof req.body.like === 'undefined' || req.body.like === true){
                            db.incrementLikes(req.params.id,data.user.username).then((result => {
                                res.status(200).json({status: 'OK'});
                            })).catch(err => { res.status(500).json({status: 'error'})});
                        } 
                        else{
                            db.decrementLikes(req.params.id,data.user.username).then((result => {
                                res.status(200).json({status: 'OK'});
                            })).catch(err => { res.status(500).json({status: 'error'})});
                        }
                     }   
                    });
        }
    });
});


function verifyToken(req,res,next) {
    let token = req.cookies['token'];
    if(!token){ 
        res.status(500);
        res.json({status: 'error', error: 'User not logged in'});
    }
    else{
        req.token = token;
        next();
    }
}

function setToken(req,res,next) {
    req.token = req.cookies['token'];
    next();
}

app.listen(5003,"192.168.122.21");

