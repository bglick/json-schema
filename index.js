const fs = require("fs");
const path = require("path");

function applyIntrinsicFunctions(schema) {
    if (schema.properties) {
        schema.properties = applyCFStringFunctions(schema.properties)
    }
    if (schema.definitions) {
        schema.definitions = applyCFStringFunctions(schema.definitions)
    }
    return schema
}

function applyCFStringFunctions(obj) {
    Object.keys(obj).forEach((key) => {
        let val = obj[key];

        if (val.type === "string") {
            const {description} = val

            if (description) {
                delete val.description
            }

            val = {
                "oneOf": [
                    {
                        ...val
                    },
                    /*
                    {
                        pattern: "\\$\\{.*",
                        type: "string"
                    },
                    */
                    {
                        "$ref": "../component/functions.json#/AwsFunctionString"
                    }
                ]
            }

            if (description) {
                val.description = description
            }

            obj[key] = val
        } else if (val.type === "object") {
            if (obj[key].properties) {
                obj[key].properties = applyCFStringFunctions(obj[key].properties)
            }
        }
    })

    return obj
}

/**
 *
 * @param {string} dirName directory path full
 * @param {string} fileName name of the file
 * @param {string} schemaFileName name of the file
 */
function readAndMoveResourceFile(dirName, fileName, schemaFileName) {
    try {
        const schema = fs.readFileSync(path.join(dirName, fileName, schemaFileName)).toString()
        fs.writeFileSync(path.join(__dirname, ".data/cloudformation", schemaFileName), schema)
    } catch (err) {
        console.error(err)
        console.log("DW")
    }
}

/**
 * There are certain 3rd party resources that also support cloudformation
 * This function will pull the schemas and populate into the cloudformation Directory
 * Currently Supported Items:-
 * 1. MongoDB
 * 2. DataDog
 */
function getThirdPartySchemas() {
    const mongoDir = path.join(
        __dirname,
        "serverless/resource/third-party-resource",
        "mongodbatlas-cloudformation-resource",
        "cfn-resource"
    )

    fs.readdirSync(mongoDir).forEach(r => {
        const schemaFileName = `mongodb-atlas-${r.replaceAll('-', '')}.json`
        readAndMoveResourceFile(mongoDir, r, schemaFileName)
    })

    const datadogDir = path.join(
        __dirname,
        "serverless/resource/third-party-resource",
        "datadog-cloudformation-resource"
    )

    fs.readdirSync(datadogDir).forEach(r => {
        const schemaFileName = `${r.replaceAll('-handler', '')}.json`
        readAndMoveResourceFile(datadogDir, r, schemaFileName)
    })
}

(async () => {
    //await getThirdPartySchemas()

    // "$ref": "shared.json#/DeletionPolicy"
    const sharedAttributes = {
        "DeletionPolicy": {
            "$ref": "shared.json#/DeletionPolicy"
        },
        "UpdateReplacePolicy": {
            "$ref": "shared.json#/UpdateReplacePolicy"
        },
        "Metadata": {
            "$ref": "shared.json#/Metadata"
        },
        "CreationPolicy": {
            "$ref": "shared.json#/CreationPolicy"
        },
        "UpdatePolicy": {
            "$ref": "shared.json#/UpdatePolicy"
        },
        "DependsOn": {
            "$ref": "shared.json#/DependsOn"
        }
    }

    /**
     * These resource files are downloaded from cloudformation for us-east-1
     * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-type-schemas.html
     */
    const region = 'us-east-1'
    const resourcesPath = path.join(__dirname, `.data/cloudformation`);
    const resources = fs.readdirSync(resourcesPath);
    const resourcesSchema = {
        $schema: "http://json-schema.org/draft-07/schema#",
        $comment: "DO NOT EDIT THIS FILE DIRECTLY! THIS FILE IS GENERATED BY AN AUTOMATED PROCESS",
        type: "object",
        description: "Auto generated schema from individual resource definition from Cloudformation",
        definitions: {}
    }

    for (const resource of resources) {
        let schema = {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            ...require(`${resourcesPath}/${resource}`)
        }

        const resourceName = schema.typeName.split("::").join("")

        resourcesSchema.definitions[resourceName] = {
            type: "object",
            additionalProperties: false,
            properties: {
                Type: {
                    type: "string",
                    enum: [
                        schema.typeName
                    ],
                },
                Properties: {
                    $ref: `resources/${resource}`
                },
                ...sharedAttributes
            },
            required: [
                "Type",
                "Properties"
            ]
        }

        // modify properties so they would allow for Cloudformation functions
        schema = applyIntrinsicFunctions(schema)

        /*
        // remove readonly properties
        if (schema.readOnlyProperties) {
            schema.readOnlyProperties.forEach(rP => {
                const parts = rP.trim().split("/")
                const property = parts[parts.length - 1]
                if (schema.properties[property]) {
                    delete schema.properties[property]
                }
            })
        }

        // Add title to every definition
        if (schema.definitions) {
            Object.keys(schema.definitions).forEach((key) => {
                if (schema.definitions[key]) {
                    if (!schema.definitions[key].title) {
                        let newTitle = `${resourceName}${key}`
                        if (!newTitle.toLowerCase().trim().endsWith('definition')) {
                            newTitle += 'Definition'
                        }
                        schema.definitions[key].title = newTitle
                    }
                }
            })
        }
        */

        // remove properties that we are not going to use
        delete schema.typeName
        delete schema.handlers
        delete schema.createOnlyProperties
        delete schema.readOnlyProperties
        delete schema.writeOnlyProperties
        delete schema.primaryIdentifier
        delete schema.tagging
        delete schema.sourceUrl
        delete schema.deprecatedProperties

        const resourcesDir = `serverless/provider/aws/resources`;
        fs.mkdirSync(resourcesDir, {recursive: true})

        fs.writeFileSync(
            path.join(__dirname, `${resourcesDir}/${resource}`),
            JSON.stringify(schema, null, 2)
        )
    }

    resourcesSchema.AwsResources = {
        type: "object",
        minProperties: 1,
        patternProperties: {
            "^[a-zA-Z0-9]{1,255}$": {
                oneOf: Object.keys(resourcesSchema.definitions).map((definition) => {
                    return {
                        $ref: "#/definitions/" + definition
                    }
                })
            }
        }
    }

    fs.writeFileSync(
        path.join(__dirname, `serverless/provider/aws/resources.json`),
        JSON.stringify(resourcesSchema, null, 2)
    )
})()
