const express = require('express');
const { MongoClient, ServerApiVersion, ClientSession, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 9500;
const cors = require('cors');
const stripe = require('stripe')(process.env.DB_STRIPE_SECRET_KEY);

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

        // app.get('/userProfile/:email', async(req, res) =>{
        //     const email = req.params.email;
        //     const query = {email: email};
        //     const result = await usersCollection.findOne(query);
        //     res.send(result);
        // })

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

        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount, 'amount inside the intent')

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });

        app.post('/payments', async(req, res) =>{
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
    
            //carefully each item delete from the cart;
            // console.log('payment info', paymentResult);
            // const query = {
            //     _id: {
            //         $in: payment.servicesId(id => new ObjectId(id))
            // }}
    
            // const deleteResult = await appointmentCollection.deleteOne(query)
    
            res.send({
                paymentResult, 
                // deleteResult
            })
        })

        app.get('/payments', verifyToken, async(req, res) =>{
            const email = req.query.email;
            const query = {email: email};
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })


        // admin-start
        app.get('/admin-start', verifyToken, verifyAdmin, async(req, res) =>{
            const user = await usersCollection.estimatedDocumentCount();
            const doctors = await doctorsCollection.estimatedDocumentCount();
            const appointments = await appointmentCollection.estimatedDocumentCount();

            res.send({
                user,
                doctors,
                appointments,
            })

        })
        

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