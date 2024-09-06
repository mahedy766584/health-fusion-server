const express = require('express');
const { MongoClient, ServerApiVersion, ClientSession, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 9500;
const cors = require('cors');
const stripe = require('stripe')('sk_test_51PtvtRILVhqQhMxhK2zAtD7WM8qUcZNnO3i09r89J1LNjGfpmWiAwBaWWJUKBgHMNW0955r2WMTyIAdwEJ5lxHx800FKxxS7KA');

app.use(cors());
app.use(express.json());

const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@ac-dczafpo-shard-00-00.ylujpzf.mongodb.net:27017,ac-dczafpo-shard-00-01.ylujpzf.mongodb.net:27017,ac-dczafpo-shard-00-02.ylujpzf.mongodb.net:27017/?ssl=true&replicaSet=atlas-ul1323-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // await client.connect();

        const servicesCollection = client.db("healthFusion").collection("services");
        const reviewsCollection = client.db("healthFusion").collection("reviews");
        const doctorsCollection = client.db("healthFusion").collection("doctors");
        const appointmentCollection = client.db("healthFusion").collection("appointment");
        const usersCollection = client.db("healthFusion").collection("users");
        const paymentCollection = client.db("healthFusion").collection("payment");


        //jwt related API
        app.post('/jwt', async(req, res) =>{
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET,{
                expiresIn: '356d'
            })
            res.send({token})
        })

        //middleware
        const verifyToken = async(req, res, next) =>{
            console.log('inside the verify token headers--------->' ,req.headers.authorization);
            if(!req.headers.authorization){
                return res.status(401).send({message: 'forbidden access'})
            }
            const token = req.headers.authorization.split(' ')[1]
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) =>{
                if(err){
                    return res.status(401).send({message: 'forbidden access'})
                }
                req.decoded = decoded;
                next();
            })
        }

        //use verify admin after verifyToken
        const verifyAdmin = async(req, res, next) =>{
            const email = req.decoded.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if(!isAdmin){
                return res.status(403).send({message: 'forbidden access'})
            }
            next();
        }

        // user related API
        app.post('/users', async(req, res) =>{
            const users = req.body;

            const query = {email: users?.email};
            const existingUser = await usersCollection.findOne(query);
            if(existingUser){
                return res.send({message: 'user already exist', insertedId: null})
            }

            const result = await usersCollection.insertOne(users);
            res.send(result)
        })

        app.get('/users', verifyToken, verifyAdmin, async(req, res) =>{
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        //admin
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async(req, res) =>{
            const id = req.params.id;
            const filter = {_id: new ObjectId(id)}
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.get('/users/admin/:email', verifyToken, async(req, res) =>{
            const email = req.params.email;

            if(email !== req.decoded.email){
                return res.status(403).send({message: 'forbidden access'})
            }

            const query = {email: email};
            const user = await usersCollection.findOne(query);
            let admin = false;
            if(user){
                admin = user?.role === 'admin'
            }
            res.send({admin})
        })

        app.delete('/users/:id', async(req, res) =>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })


        //services API
        app.get('/services', async(req, res) =>{
            const result = await servicesCollection.find().toArray();
            res.send(result)
        })

        //reviews API
        app.get('/reviews', async(req, res) =>{
            const result = await reviewsCollection.find().toArray();
            res.send(result)
        })

        //doctors API
        app.post('/doctors', verifyToken, verifyAdmin, async(req, res) =>{
            const doctorBody = req.body;
            const result = await doctorsCollection.insertOne(doctorBody);
            res.send(result)
        })

        app.get('/doctors', async(req, res) =>{
            const result = await doctorsCollection.find().toArray();
            res.send(result)
        })

        app.get('/doctors/:id', async(req, res) =>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await doctorsCollection.findOne(query);
            res.send(result)
        })

        app.delete('/doctors/:id',verifyToken, verifyAdmin,  async(req, res) =>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await doctorsCollection.deleteOne(query);
            res.send(result);
        })

        //Appointment api
        app.post('/appointment', async(req, res) =>{
            const users = req.body;
            const result = await appointmentCollection.insertOne(users);
            console.log('appointment---->', result);
            res.send(result);
        })

        app.get('/appointment', verifyToken, async(req, res) =>{
            // console.log('headers--------->' ,req.headers);
            const email = req.query.email;
            const query = {isEmail: email}
            const result = await appointmentCollection.find(query).toArray()
            res.send(result);
        })

        app.delete('/appointment/:id', verifyToken, async(req, res) =>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await appointmentCollection.deleteOne(query);
            res.send(result);
        })

        //payment api
        app.post('/payment', async (req, res) => {
            const {serviceName, price,  isEmail} = req.body;
            console.log({price, isEmail});
            try {
                const product = await stripe.products.create({
                    name: serviceName,
                });
        
                const servicePrice = await stripe.prices.create({
                    product: product.id,
                    unit_amount: price * 100, // 100 INR
                    currency: 'usd',
                });
        
                const session = await stripe.checkout.sessions.create({
                    line_items: [
                        {
                            price: servicePrice.id,
                            quantity: 1,
                        }
                    ],
                    mode: 'payment',
                    success_url: 'http://localhost:9500/',
                    cancel_url: 'http://localhost:9500/dashboard',
                    customer_email: isEmail,
                });
        
                res.json({ url: session.url });
            } catch (error) {
                console.error('Error creating payment session:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });
        

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('HealthFusion Server Running')
})

app.listen(port, () => {
    console.log(`HealthFusion Server Running On ${port}`)
})