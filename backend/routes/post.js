const express = require("express");
const fs = require("fs");
const path = require("path");
const { Post, File, User } = require("../models");
const Sequelize = require("sequelize");
const multer = require("multer");
const { isLoggedIn } = require("./middlewares");
const Op = Sequelize.Op;
const utils = require("../utils");
const { multerStorage } = require("../utils/fileS3");

const router = express.Router();

fs.readdir("public/img", (error) => {
    if (error) {
        console.log("img 폴더 생성");
        fs.mkdirSync("public/img");
    }
});
const imgMulter = multer({
    storage: multer.diskStorage({
        destination(req, file, cb) {
            cb(null, "public/img/");
        },
        filename(req, file, cb) {
            const ext = path.extname(file.originalname);
            cb(
                null,
                path.basename(file.originalname, ext) + new Date().valueOf() + ext
            );
        },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
});

router.get("/list", multer().none(), async(req, res, next) => {
    try {
        const posts = await Post.findAll({
            include: [File, { model: User, attributes: ["id"] }],
        });
        return res.json(posts);
    } catch {
        console.log("에러!");
        console.error(error);
        return next(error);
    }
});

router.get("/list/sale", multer().none(), async(req, res, next) => {
    try {
        const posts = await Post.findAll({
            where: { is_selling: 0, writer_id: req.user.id },
            include: [File],
        });
        return res.json(posts);
    } catch (error) {
        console.error(error);
        return next(error);
    }
});

router.get("/list/done", multer().none(), async(req, res, next) => {
    try {
        const posts = await Post.findAll({
            where: { is_selling: 1, writer_id: req.user.id },
            include: [File],
        });
        console.log(posts);
        if (!posts || posts === undefined) {
            const message = "게시물이 없습니다.";
            return res.status(404).send({
                data: {
                    message,
                },
            });
        }
        return res.json(posts);
    } catch (error) {
        console.error(error);
        return next(error);
    }
});

router.post(
    "/soldout/:id",
    isLoggedIn,
    multer().none(),
    async(req, res, next) => {
        let post;
        try {
            post = await Post.findByPk(req.params.id);
            post = await post.update({
                is_selling: 1,
            });
            res.json(post);
        } catch (error) {
            console.error(error);
            next(error);
        }
    }
);

router.post("/search", multer().none(), (req, res, next) => {
    const { keyword } = req.body;

    if (keyword.trim() == "") {
        return res.status(400).send({
            message: "검색어가 비어있습니다.",
        });
    }
    const query = `%${keyword}%`;

    Post.findAll({
            attributes: ["id", "title", "price", "created_at"],
            where: {
                [Op.or]: [{
                        title: {
                            [Op.like]: query,
                        },
                    },
                    {
                        author: {
                            [Op.like]: query,
                        },
                    },
                    {
                        publisher: {
                            [Op.like]: query,
                        },
                    },
                ],
            },
        })
        .then((result) => {
            res.json(result);
        })
        .catch((error) => {
            console.error(error);
            next(error);
        });
});

router.get("/:id", multer().none(), async(req, res, next) => {
    const postId = req.params.id;

    const posts = await Post.findOne({
        where: { id: postId },
        include: [File],
    });
    res.json(posts);
});

router.post("/img", isLoggedIn, imgMulter.single("img"), (req, res, next) => {
    console.log(req.file);
    res.json({ url: `/img/${req.file.filename}` });
});

router.post("/upload", isLoggedIn, multer().none(), async(req, res, next) => {
    const {
        title,
        author,
        publisher,
        price,
        condition,
        description,
        is_selling,
        writer_id,
        url,
    } = req.body;
    let post_id = null;

    await Post.create({
            title: title,
            author: author,
            publisher: publisher,
            price: price,
            condition: condition,
            description: description,
            is_selling: is_selling,
            writer_id: writer_id,
        })
        .then((result) => {
            console.log(result.dataValues);
            post_id = result.dataValues.id;
            console.log(post_id);
        })
        .catch((error) => {
            console.error(error);
            // next(error);
        });

    await File.create({
            file_type: "image",
            url: url,
            post_id: post_id,
        })
        .then((result) => {
            console.log(result);
            res.send(result);
        })
        .catch((error) => {
            console.error(error);
            // next(error);
        });
});

router.post(
    "/upload/s3",
    isLoggedIn,
    multerStorage.array("images"),
    async(req, res, next) => {
        const {
            title,
            author,
            publisher,
            price,
            condition,
            description,
            is_selling,
            images,
        } = req.body;
        console.log(req.body);
        console.log(req.files);

        try {
            let user, post;

            const init = async() => {
                await Promise.all([
                    User.findByPk(req.user.id).then((obj) => (user = obj)),
                ]);
            };

            const postCreate = async() => {
                console.log("postCreate");
                post = await Post.create({
                    title,
                    author,
                    publisher,
                    price,
                    condition,
                    description,
                    is_selling,
                    writer_id: req.user.id,
                });
            };

            const associate = () => {
                console.log("associate");
                return Promise.all([
                    user.addPost(post),
                    utils.FileS3.upload_S3(post, req.files),
                ]);
            };

            const recall = async() => {
                console.log("recall");
                post = await Post.findByPk(post.id, {
                    include: [{ model: User, attributes: ["email"] }],
                });
                const files = await File.findAll({ where: { post_id: post.id } });
                post.File = files;
            };

            await init();
            await postCreate();
            await associate();
            await recall();

            // // const user = await User.findByPk(req.user.id);
            // // await user.addPost(post);
            // // await upload.upload_S3(post, files);
            // res.json(post);
            res.json(req.files);
        } catch (error) {
            console.log("에러!");
            console.error(error);
            return next(error);
        }
    }
);

router.post("/modify", isLoggedIn, async(req, res, next) => {
    const {
        post_id,
        title,
        author,
        publisher,
        price,
        condition,
        description,
        is_selling,
    } = req.body;

    try {
        await Post.update({
            title,
            author,
            publisher,
            price,
            condition,
            description,
            is_selling,
            writer_id: req.user.id,
        }, {
            where: {
                writer_id: req.user.id,
                id: post_id,
            },
        });

        res.json({ message: "업데이트 성공" });
    } catch {
        console.log("에러!");
        console.error(error);
        return next(error);
    }
});

router.post("/delete", isLoggedIn, async(req, res, next) => {
    const { post_id } = req.body;

    try {
        Post.destroy({
            where: {
                writer_id: req.user.id,
                id: post_id,
            },
        });

        res.json({ message: "삭제 성공" });
    } catch {
        console.log("에러!");
        console.error(error);
        return next(error);
    }
});

router.post("/search/:keyword", async(req, res, next) => {
    try {
        const keyword = req.params.keyword;
        const searchOption = req.body.searchOption;
        let post;
        let data = [];

        console.log("시작");
        if (searchOption == "title") {
            post = await Post.findAll({
                where: {
                    title: {
                        [Op.like]: "%" + keyword + "%",
                    },
                },
                include: [File],
                order: [
                    ["created_at", "DESC"]
                ],
            });
            console.log("post >> ", post);
        }
        data.push({ data_type: "post", data_list: post });
        res.json(post);
    } catch (error) {
        console.error(error);
        next(error);
    }
});

module.exports = router;