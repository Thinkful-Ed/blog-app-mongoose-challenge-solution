const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

const expect = chai.expect;

chai.should();

const {DATABASE_URL} = require('../config');
const {BlogPost} = require('../models');
const {runServer, app} = require('../server');


chai.use(chaiHttp);

let server;

// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure  ata from one test does not stick
// around for next one
function tearDownDb() {
  console.warn('Deleting database');
  mongoose.connection.dropDatabase();
}


// used to put randomish documents in db
// so we have data to work with and assert about.
// we use the Faker library to automatically
// generate placeholder values for author, title, content
// and then we insert that data into mongo
function seedBlogPostData(cb) {
  console.info('seeding blog post data');
  const seedData = [];
  for (let i=1; i<=10; i++) {
    seedData.push({
      author: {
        firstName: faker.name.firstName(),
        lastName: faker.name.lastName()
      },
      title: faker.lorem.sentence(),
      content: faker.lorem.text()
    })
  }
  BlogPost.insertMany(seedData).then(cb);
}


describe('blog posts API resource', function() {

  beforeEach(function() {
    // run the server, and once it's going seed db so we have data
    // to work with
    runServer(seedBlogPostData);
  });

  afterEach(function() {
    // tear down database so we ensure no state from this test
    // effects any coming after.
    tearDownDb();
  });

  // note the use of nested `describe` blocks.
  // this allows us to make clearer, more discrete tests that focus
  // on proving something small
  describe('GET endpoint', function() {

    it('should return all existing posts', function(done) {
      // strategy:
      //    1. get back all posts returned by by GET request to `/posts`
      //    2. prove res has right status, data type
      //    3. prove the number of posts we got back is equal to number
      //       in db.
        chai.request(app)
        .get('/posts')
        .end(function(err, res) {

          res.should.have.status(200);
          // otherwise our db seeding didn't work
          res.body.should.have.length.of.at.least(1);

          BlogPost
            .count()
            .then(count => {
              // the number of returned posts should be same
              // as number of posts in DB
              res.body.should.have.length.of(count);
              done();
          });
      });
    });

    it('should return posts with right fields', function(done) {
      // Strategy: Get back all posts, and ensure they have expected keys
      chai.request(app)
        .get('/posts')
        .end(function(err, res) {

          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('array');

          res.body.should.have.length.of.at.least(1);

          res.body.forEach(function(post) {
            post.should.be.a('object');
            post.should.include.keys('id', 'title', 'content', 'author', 'created');
          });

          // just check one of the posts that its values match with those in db
          // and we'll assume it's true for rest
          const resPost = res.body[0]
          BlogPost
            .findById(resPost.id)
            .then(post => {
              resPost.title.should.equal(post.title);
              resPost.content.should.equal(post.content);
              resPost.author.should.equal(post.authorName);
              done();
            })
            .catch(err => console.error(err));
      });
    });
  });

  describe('POST endpoint', function() {
    // strategy: make a POST request with data,
    // then prove that the post we get back has
    // right keys, and that `id` is there (which means
    // the data was inserted into db)
    it('should add a new blog post', function(done) {

      const newPost = {
          title: faker.lorem.sentence(),
          author: {
            firstName: faker.name.firstName(),
            lastName: faker.name.lastName(),
          },
          content: faker.lorem.text()
      };

      chai.request(app)
        .post('/posts')
        .send(newPost)
        .end(function(err, res) {
          res.should.have.status(201);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.include.keys(
            'id', 'title', 'content', 'author', 'created');
          res.body.title.should.equal(newPost.title);
          // cause Mongo should have created id on insertion
          res.body.id.should.not.be.null;
          res.body.author.should.equal(
            `${newPost.author.firstName} ${newPost.author.lastName}`);
          res.body.content.should.equal(newPost.content);
          done();
        })
    });
  });

  describe('PUT endpoint', function() {

    // strategy:
    //  1. Get an existing post from db
    //  2. Make a PUT request to update that post
    //  3. Prove post returned by request contains data we sent
    //  4. 
    it('should update fields you send over', function(done) {

      BlogPost
        .findOne()
        .then(post =>{

          const updateData = {
            id: post.id,
            title: 'cats cats cats',
            content: 'dogs dogs dogs',
            author: {
              firstName: 'foo',
              lastName: 'bar'
            }
          };

          chai.request(app)
            .put(`/posts/${post.id}`)
            .send(updateData)
            .then(res => {
              res.should.have.status(201);
              res.should.be.json;
              res.body.should.be.a('object');
              res.body.title.should.equal(updateData.title);
              res.body.author.should.equal(
                `${updateData.author.firstName} ${updateData.author.lastName}`);
              res.body.content.should.equal(updateData.content);
              done();
            })
            .catch(err => console.error(err));
        });
    });
  });

  describe('DELETE endpoint', function() {
    // strategy:
    //  1. get a post
    //  2. make a DELETE request for that post's id
    //  3. assert that response has right status code
    //  4. prove that post with the id doesn't exist in db anymore
    it('delete post', function(done) {

      // proves that a post does not exist in db anymore
      function assertBlogPostDoesntExist(postId, callback) {
        BlogPost.findById(postId)
          .then(resp => {
            expect(resp).to.be.null;
            callback();
          })
          .catch(
            err => console.log(err)
          );
      }

      const getPostId = BlogPost
        .findOne()
        .exec()
        .then(post => {
          chai.request(app)
            .delete(`/posts/${post.id}`)
            .then(resp => {
              resp.should.have.status(204);
              assertBlogPostDoesntExist(post.id, done);
            })
            .catch(err => console.log(err));
          })
        .catch(err => {console.log(err)});
    });
  });


});
