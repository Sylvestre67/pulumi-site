"use strict"

const aws = require("@pulumi/aws")
const awsx = require("@pulumi/awsx")

const fs = require("fs")
const pulumi = require("@pulumi/pulumi")
const mime = require("mime")

// Create a KMS Key for S3 server-side encryption
const key = new aws.kms.Key("pulumi-key")

// Create an AWS resource (S3 Bucket)
const siteBucket = new aws.s3.Bucket("pulumi-site", {
  serverSideEncryptionConfiguration: {
    rule: {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "aws:kms",
        kmsMasterKeyId: key.id,
      },
    },
  },
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

// Export the name of the bucket
exports.bucketName = siteBucket.id
