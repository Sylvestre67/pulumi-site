"use strict"

const aws = require("@pulumi/aws")

const fs = require("fs")
const pulumi = require("@pulumi/pulumi")
const mime = require("mime")

// Create an AWS resource (S3 Bucket)
const siteBucket = new aws.s3.Bucket("pulumi-site", {
  website: {
    indexDocument: "index.html",
  },
})

// Create an S3 Bucket Policy to allow public read of all objects in bucket
// This reusable function can be pulled out into its own module
function publicReadPolicyForBucket(bucketName) {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [
          `arn:aws:s3:::${bucketName}/*`, // policy refers to bucket name explicitly
        ],
      },
    ],
  })
}

// Set the access policy for the bucket so all objects are readable
let bucketPolicy = new aws.s3.BucketPolicy("bucketPolicy", {
  bucket: siteBucket.bucket, // depends on siteBucket -- see explanation below
  policy: siteBucket.bucket.apply(publicReadPolicyForBucket),
  // transform the siteBucket.bucket output property -- see explanation below
})

let siteDir = "./site/public" // directory for content files

// For each file in the directory, create an S3 object stored in `siteBucket`

// crawlDirectory recursive crawls the provided directory, applying the provided function
// to every file it contains. Doesn't handle cycles from symlinks.
function crawlDirectory(dir, f) {
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const filePath = `${dir}/${file}`
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      crawlDirectory(filePath, f)
    }
    if (stat.isFile()) {
      f(filePath)
    }
  }
}

crawlDirectory(siteDir, filePath => {
  const relativeFilePath = filePath.replace(siteDir + "/", "")
  const contentFile = new aws.s3.BucketObject(
    relativeFilePath,
    {
      key: relativeFilePath,
      acl: "public-read",
      bucket: siteBucket,
      contentType: mime.getType(filePath) || undefined,
      source: new pulumi.asset.FileAsset(filePath),
    },
    {
      parent: siteBucket,
    }
  )
})

// output the endpoint as a stack output
exports.websiteUrl = siteBucket.websiteEndpoint
