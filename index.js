const express = require('express');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 9500;
const cors = require('cors');


app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('HealthFusion Server Running')
})

app.listen(port, () => {
    console.log(`HealthFusion Server Running On ${port}`)
})