<template>
    <div>
        <Header></Header>
        <Detail></Detail>
    </div>
</template>

<script>
    import Header from "../components/Header.vue";
    import Detail from "../components/Detail.vue";
    export default {
        //Javascript - 인스턴스
        components: {
            Detail,
            Header,
        },
    };
</script>

<style>
/* CSS */
</style>
